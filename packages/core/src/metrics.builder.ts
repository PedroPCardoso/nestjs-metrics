import { DateTime } from 'luxon';
import type { ObjectLiteral, SelectQueryBuilder } from 'typeorm';
import { Aggregate } from './enums/aggregate.enum';
import { Period } from './enums/period.enum';
import { InvalidPeriodException } from './exceptions/invalid-period.exception';
import { InvalidVariationsCountException } from './exceptions/invalid-variations-count.exception';
import { assertAggregate, assertDateFormat, assertSafeIdentifier, assertTimezone } from './validation';
import { validateExecutorSpec, validateMetricsOptions } from './options.schema';
import { dialectFor } from './dialects/dialect.factory';
import { DatePart, SqlDialect } from './dialects/sql-dialect.interface';
import { QueryBackend } from './backend/query-backend.interface';
import { QueryPlan, SelectItem } from './backend/query-plan';
import { TypeOrmBackend } from './backend/typeorm.backend';
import { ExecutorBackend } from './backend/executor.backend';
import { DataSource, ExecutorSpec } from './datasource';
import { compileWhere, CompiledWhere, WhereInput } from './where';
import { normalizeData, normalizeLabel } from './formatting/normalize';
import { PeriodResolver } from './dates/period-resolver';
import { enumerateBuckets } from './dates/bucket-series';
import { LabelFormatter } from './formatting/label-formatter';
import {
  RawTrendRow,
  TrendsFormatter,
  percentArray,
  toPercent,
} from './formatting/trends.formatter';
import { gapFillRaw, populate, presentIntegerLabels } from './formatting/missing-data';
import { GroupedTrendsResult, MetricsOptions, TrendsResult, VariationResult } from './types';
import { PERIOD_TO_DATE_PART, toTrendRow, isRecord } from './types/helpers';
import type { CacheOptions, CacheStore } from './cache/types';
import { planCacheKey } from './cache/cache-key';
import { defaultCacheStore } from './cache/shared';

const DEFAULT_LOCALE = 'en';
const DEFAULT_TIMEZONE = 'UTC';

/**
 * Fluent builder that turns a query source into chart-ready metrics and trends.
 * It runs over a TypeORM `SelectQueryBuilder` (see {@link query}) or, ORM-agnostically,
 * over a {@link DataSource} such as Prisma or Drizzle (see {@link queryExecutor}). The
 * chain is synchronous; only the terminal methods ({@link metrics}, {@link trends},
 * {@link metricsWithVariations}) execute against the database and are async.
 *
 * @typeParam T - Row/entity shape the underlying query produces.
 *
 * @example
 * ```ts
 * // Single value: total revenue.
 * const revenue = await Metrics.query(orderRepo.createQueryBuilder('order'))
 *   .sum('amount')
 *   .metrics();
 *
 * // Time series: order counts for the last 3 months.
 * const series = await Metrics.query(orderRepo.createQueryBuilder('order'))
 *   .countByMonth('id', 3)
 *   .trends();
 * ```
 *
 * @see {@link metricsFor} and {@link withMetrics} for repository-centric entry points.
 */
export class MetricsBuilder<T extends ObjectLiteral> {
  /**
   * Set to `true` to skip Zod schema validation on constructor and queryExecutor
   * entry points. Useful when the caller already validates or when every
   * microsecond matters in hot paths.
   */
  static skipValidation = false;

  private tableName: string;
  private readonly dialect: SqlDialect;
  private readonly locale: string;
  private readonly timezone: string;
  private aggregateFn: Aggregate = Aggregate.COUNT;
  private column: string;
  private dateColumnRef: string;
  private period: Period | null = null;
  /** Window size for the period (0 = whole period). Named to avoid colliding with the count() aggregate method. */
  private windowCount = 0;
  /** Explicit date range (set by between/from); takes precedence over period. */
  private range: { start: string; end: string } | null = null;
  /** Granularity used to bucket a date range. */
  private groupBy: DatePart = 'day';
  /** Categorical column to group by instead of a date period. */
  private labelColumnName: string | null = null;
  /** Structured executor-mode filters (ANDed onto every query). */
  private extraFilters: CompiledWhere | null = null;
  private fill = false;
  private missingValue = 0;
  private missingLabels: (string | number)[] = [];
  private groupedLabels: (string | number)[] = [];
  private groupedAggregate: Aggregate = Aggregate.SUM;
  private caching: CacheOptions | null = null;
  private cacheStore: CacheStore | undefined;
  private now = new Date();
  private year: number = this.now.getFullYear();
  private month: number = this.now.getMonth() + 1;
  private day: number = this.now.getDate();
  private week: number = isoWeek(this.now);

  /**
   * @internal Construct via the {@link query} or {@link queryExecutor} factories
   * rather than directly; the constructor takes an internal backend.
   */
  constructor(
    private readonly backend: QueryBackend,
    tableName: string,
    options: MetricsOptions = {},
    cacheStore?: CacheStore,
  ) {
    if (!MetricsBuilder.skipValidation) {
      validateMetricsOptions(options);
    }
    this.tableName = tableName;
    this.dialect = backend.dialect;
    this.locale = options.locale ?? DEFAULT_LOCALE;
    this.timezone = options.timezone ?? DEFAULT_TIMEZONE;
    assertTimezone(this.timezone);
    if (options.cache?.enabled) {
      this.caching = options.cache;
      this.cacheStore = cacheStore ?? defaultCacheStore;
    }
    this.column = this.qualify('id');
    this.dateColumnRef = this.qualify('created_at');
  }

  /**
   * Single choke point that turns a bare column name into a table-qualified,
   * driver-escaped identifier. Every consumer-supplied identifier passes through
   * here: it is validated against the allowlist and then escaped, so it can
   * never inject SQL (named parameters do not protect identifiers).
   */
  private qualify(column: string): string {
    assertSafeIdentifier(column);
    return `${this.escapeId(this.tableName)}.${this.escapeId(column)}`;
  }

  private escapeId(name: string): string {
    return this.backend.escapeId(name);
  }

  /**
   * A fresh builder over a clone of the query, carrying the aggregate/column
   * state needed for a bare metric. Single place to copy metric-affecting
   * state (extend here when adding new aggregate-relevant fields, e.g. timezone).
   */
  private baseClone(): MetricsBuilder<T> {
    // The backend clones the underlying query per run(), so it is safe to share.
    const clone = new MetricsBuilder<T>(this.backend, this.tableName, {
      locale: this.locale,
      timezone: this.timezone,
    }, this.cacheStore);
    clone.aggregateFn = this.aggregateFn;
    clone.column = this.column;
    clone.dateColumnRef = this.dateColumnRef;
    clone.tableName = this.tableName;
    clone.extraFilters = this.extraFilters;
    clone.caching = this.caching;
    clone.cacheStore = this.cacheStore;
    return clone;
  }

  /**
   * Entry point over a TypeORM `SelectQueryBuilder` (the original API). The
   * builder's table alias comes from `qb.alias`, so columns qualify correctly.
   *
   * @param qb - The TypeORM query builder to read from.
   * @param options - Locale, timezone and cache options for the query.
   * @param cacheStore - Cache backend to use when `options.cache.enabled`; defaults to a shared in-memory store.
   * @returns A builder ready for chaining.
   * @throws {@link InvalidTimezoneException} when `options.timezone` is not a valid IANA zone.
   *
   * @example
   * ```ts
   * const count = await Metrics.query(orderRepo.createQueryBuilder('order'))
   *   .count()
   *   .metrics();
   * ```
   */
  static query<T extends ObjectLiteral>(
    qb: SelectQueryBuilder<T>,
    options?: MetricsOptions,
    cacheStore?: CacheStore,
  ): MetricsBuilder<T> {
    return new MetricsBuilder(new TypeOrmBackend(qb), qb.alias, options, cacheStore);
  }

  /**
   * Entry point over an ORM-agnostic {@link DataSource} (Prisma, Drizzle, …).
   * Reads from `spec.table` (or a raw `spec.from` fragment), bucketing
   * `spec.dateColumn` and applying any `spec.where` filters to every query.
   *
   * @param dataSource - Dialect + SQL executor that runs the emitted queries.
   * @param spec - Declares the source table/columns and optional filters; see {@link ExecutorSpec}.
   * @param options - Locale, timezone and cache options for the query.
   * @param cacheStore - Cache backend to use when `options.cache.enabled`; defaults to a shared in-memory store.
   * @returns A builder ready for chaining.
   * @throws {@link InvalidIdentifierException} when `spec.table` is not a plain SQL identifier.
   *
   * @example
   * ```ts
   * const series = await Metrics.queryExecutor(dataSource, { table: 'orders', dateColumn: 'created_at' })
   *   .sumByMonth('amount', 6)
   *   .trends();
   * ```
   */
  static queryExecutor<R extends ObjectLiteral>(
    dataSource: DataSource,
    spec: ExecutorSpec,
    options?: MetricsOptions,
    cacheStore?: CacheStore,
  ): MetricsBuilder<R> {
    if (!MetricsBuilder.skipValidation) {
      validateExecutorSpec(spec);
    }
    assertSafeIdentifier(spec.table);
    const dialect = dialectFor(dataSource.dialect);
    const from = spec.from ?? dialect.escapeId(spec.table);
    const builder = new MetricsBuilder<R>(new ExecutorBackend(dataSource, from), spec.table, options, cacheStore);
    if (spec.dateColumn) {
      builder.dateColumn(spec.dateColumn);
    }
    if (spec.where) {
      builder.applyExecutorWhere(spec.where);
    }
    return builder;
  }

  /** Compile and store structured executor-mode filters (set by queryExecutor). */
  private applyExecutorWhere(where: WhereInput): void {
    this.extraFilters = compileWhere(where, (column) => this.qualify(column));
  }

  // --- Aggregates ---------------------------------------------------------

  private aggregate(fn: Aggregate, column: string): this {
    assertAggregate(fn);
    this.aggregateFn = fn;
    this.column = this.qualify(column);
    return this;
  }

  /**
   * Aggregate by counting rows.
   * @param column - Column to count (default `id`).
   * @returns This builder, for chaining.
   * @throws {@link InvalidIdentifierException} when `column` is not a plain SQL identifier.
   */
  count(column = 'id'): this {
    return this.aggregate(Aggregate.COUNT, column);
  }

  // --- Targeting ----------------------------------------------------------

  /**
   * Bucket by a date column other than `created_at`.
   * @param column - Date column to bucket on.
   * @returns This builder, for chaining.
   * @throws {@link InvalidIdentifierException} when `column` is not a plain SQL identifier.
   */
  dateColumn(column: string): this {
    this.dateColumnRef = this.qualify(column);
    return this;
  }

  /**
   * Override the table used to qualify subsequent columns (e.g. a joined table).
   * @param name - Table name to qualify with from here on.
   * @returns This builder, for chaining.
   * @throws {@link InvalidIdentifierException} when `name` is not a plain SQL identifier.
   */
  table(name: string): this {
    // Stored raw-but-validated; it is driver-escaped each time qualify() runs.
    assertSafeIdentifier(name);
    this.tableName = name;
    return this;
  }

  /**
   * Group the series by a categorical column instead of by a date period. Note
   * that the period/range WHERE filter still applies — to group within a single
   * year use e.g. `sumByYear('amount', 1).forYear(2024).labelColumn('status')`.
   *
   * @param column - Categorical column to group by.
   * @returns This builder, for chaining.
   * @throws {@link InvalidIdentifierException} when `column` is not a plain SQL identifier.
   *
   * @example
   * ```ts
   * const byStatus = await Metrics.query(orderRepo.createQueryBuilder('order'))
   *   .sumByYear('amount', 1)
   *   .forYear(2024)
   *   .labelColumn('status')
   *   .trends();
   * ```
   */
  labelColumn(column: string): this {
    this.labelColumnName = this.qualify(column);
    return this;
  }

  /**
   * Fill gaps in a trend series with a default value (0), auto-discovering the
   * expected labels. An explicit label set can be supplied for categorical
   * series.
   *
   * @param missingValue - Value to insert for missing buckets (default `0`).
   * @param missingLabels - Explicit label set for categorical series; defaults to auto-discovered labels.
   * @returns This builder, for chaining.
   */
  fillMissingData(missingValue = 0, missingLabels: (string | number)[] = []): this {
    this.fill = true;
    this.missingValue = missingValue;
    this.missingLabels = missingLabels;
    return this;
  }

  /**
   * Split the aggregate column into one data series per value, for a stacked /
   * multi-series chart. Each series counts the rows matching that value per
   * bucket (`aggregate(CASE WHEN column = value THEN 1 ELSE 0 END)`), and
   * `total` carries the main aggregate per bucket. {@link trends} then returns a
   * {@link GroupedTrendsResult} instead of a {@link TrendsResult}.
   *
   * @param labels - The column values to split into series.
   * @param aggregate - Aggregate function for each series (default {@link Aggregate.SUM}).
   * @returns This builder, for chaining.
   * @throws {@link InvalidAggregateException} when `aggregate` is not a supported function.
   */
  groupData(labels: (string | number)[], aggregate: Aggregate = Aggregate.SUM): this {
    assertAggregate(aggregate);
    this.groupedLabels = labels;
    this.groupedAggregate = aggregate;
    return this;
  }

  /**
   * Aggregate by summing `column`.
   * @param column - Numeric column to sum.
   * @returns This builder, for chaining.
   * @throws {@link InvalidIdentifierException} when `column` is not a plain SQL identifier.
   */
  sum(column: string): this {
    return this.aggregate(Aggregate.SUM, column);
  }

  /**
   * Aggregate by averaging `column`.
   * @param column - Numeric column to average.
   * @returns This builder, for chaining.
   * @throws {@link InvalidIdentifierException} when `column` is not a plain SQL identifier.
   */
  average(column: string): this {
    return this.aggregate(Aggregate.AVERAGE, column);
  }

  /**
   * Aggregate by taking the maximum of `column`.
   * @param column - Column to take the maximum of.
   * @returns This builder, for chaining.
   * @throws {@link InvalidIdentifierException} when `column` is not a plain SQL identifier.
   */
  max(column: string): this {
    return this.aggregate(Aggregate.MAX, column);
  }

  /**
   * Aggregate by taking the minimum of `column`.
   * @param column - Column to take the minimum of.
   * @returns This builder, for chaining.
   * @throws {@link InvalidIdentifierException} when `column` is not a plain SQL identifier.
   */
  min(column: string): this {
    return this.aggregate(Aggregate.MIN, column);
  }

  // --- Periods ------------------------------------------------------------

  private by(period: Period, count = 0): this {
    this.period = period;
    this.windowCount = count;
    return this;
  }

  /**
   * Bucket the series by day.
   * @param count - Window size: `0` the whole period, `1` a single day, `>1` the last `count` days.
   * @returns This builder, for chaining.
   */
  byDay(count = 0): this {
    return this.by(Period.DAY, count);
  }

  /**
   * Bucket the series by week.
   * @param count - Window size: `0` the whole period, `1` a single week, `>1` the last `count` weeks.
   * @returns This builder, for chaining.
   */
  byWeek(count = 0): this {
    return this.by(Period.WEEK, count);
  }

  /**
   * Bucket the series by month.
   * @param count - Window size: `0` the whole period, `1` a single month, `>1` the last `count` months.
   * @returns This builder, for chaining.
   */
  byMonth(count = 0): this {
    return this.by(Period.MONTH, count);
  }

  /**
   * Bucket the series by year.
   * @param count - Window size: `0` the whole period, `1` a single year, `>1` the last `count` years.
   * @returns This builder, for chaining.
   */
  byYear(count = 0): this {
    return this.by(Period.YEAR, count);
  }

  // --- Date ranges --------------------------------------------------------

  /**
   * Scope the query to an explicit, inclusive date range (overrides any period).
   * Pair with a `groupBy*` method to choose the bucket granularity.
   *
   * @param start - Range start as an ISO `YYYY-MM-DD` date.
   * @param end - Range end as an ISO `YYYY-MM-DD` date.
   * @returns This builder, for chaining.
   * @throws {@link InvalidDateFormatException} when a bound is not a valid `YYYY-MM-DD` date.
   */
  between(start: string, end: string): this {
    assertDateFormat(start);
    assertDateFormat(end);
    this.range = { start, end };
    this.period = null;
    return this;
  }

  /**
   * Scope the query from `date` up to today (an open-ended {@link between}).
   * @param date - Range start as an ISO `YYYY-MM-DD` date.
   * @returns This builder, for chaining.
   * @throws {@link InvalidDateFormatException} when `date` is not a valid `YYYY-MM-DD` date.
   */
  from(date: string): this {
    return this.between(date, today());
  }

  private setGroupBy(part: DatePart): this {
    this.groupBy = part;
    return this;
  }

  /** Bucket a {@link between}/{@link from} range by day. @returns This builder, for chaining. */
  groupByDay(): this {
    return this.setGroupBy('day');
  }

  /** Bucket a {@link between}/{@link from} range by week. @returns This builder, for chaining. */
  groupByWeek(): this {
    return this.setGroupBy('week');
  }

  /** Bucket a {@link between}/{@link from} range by month. @returns This builder, for chaining. */
  groupByMonth(): this {
    return this.setGroupBy('month');
  }

  /** Bucket a {@link between}/{@link from} range by year. @returns This builder, for chaining. */
  groupByYear(): this {
    return this.setGroupBy('year');
  }

  // --- Reference point pinning -------------------------------------------

  /**
   * Pin the reference day used by `byDay` window calculations (defaults to today).
   * @param day - Day of month (1–31).
   * @returns This builder, for chaining.
   */
  forDay(day: number): this {
    this.day = day;
    return this;
  }

  /**
   * Pin the reference week used by `byWeek` window calculations (defaults to the current week).
   * @param week - ISO-8601 week number.
   * @returns This builder, for chaining.
   */
  forWeek(week: number): this {
    this.week = week;
    return this;
  }

  /**
   * Pin the reference month used by `byMonth` window calculations (defaults to the current month).
   * @param month - Month number (1–12).
   * @returns This builder, for chaining.
   */
  forMonth(month: number): this {
    this.month = month;
    return this;
  }

  /**
   * Pin the reference year used by `byYear` window calculations (defaults to the current year).
   * @param year - Four-digit year.
   * @returns This builder, for chaining.
   */
  forYear(year: number): this {
    this.year = year;
    return this;
  }

  // --- Combined shorthands ------------------------------------------------

  /** Shorthand for {@link MetricsBuilder.count | count} + {@link byDay}. */
  countByDay(column = 'id', count = 0): this {
    return this.count(column).byDay(count);
  }

  /** Shorthand for {@link MetricsBuilder.count | count} + {@link byWeek}. */
  countByWeek(column = 'id', count = 0): this {
    return this.count(column).byWeek(count);
  }

  /**
   * Shorthand for {@link MetricsBuilder.count | count} + {@link byMonth}.
   * @param column - Column to count (default `id`).
   * @param count - Month window: `0` whole period, `1` single month, `>1` last `count` months.
   * @returns This builder, for chaining.
   *
   * @example
   * ```ts
   * const series = await Metrics.query(orderRepo.createQueryBuilder('order'))
   *   .countByMonth('id', 6)
   *   .trends();
   * ```
   */
  countByMonth(column = 'id', count = 0): this {
    return this.count(column).byMonth(count);
  }

  /** Shorthand for {@link MetricsBuilder.count | count} + {@link byYear}. */
  countByYear(column = 'id', count = 0): this {
    return this.count(column).byYear(count);
  }

  /** Shorthand for {@link sum} + {@link byDay}. */
  sumByDay(column: string, count = 0): this {
    return this.sum(column).byDay(count);
  }

  /** Shorthand for {@link sum} + {@link byWeek}. */
  sumByWeek(column: string, count = 0): this {
    return this.sum(column).byWeek(count);
  }

  /** Shorthand for {@link sum} + {@link byMonth}. */
  sumByMonth(column: string, count = 0): this {
    return this.sum(column).byMonth(count);
  }

  /**
   * Shorthand for {@link sum} + {@link byYear}.
   * @param column - Numeric column to sum.
   * @param count - Year window: `0` whole period, `1` single year, `>1` last `count` years.
   * @returns This builder, for chaining.
   *
   * @example
   * ```ts
   * const revenuePerYear = await Metrics.query(orderRepo.createQueryBuilder('order'))
   *   .sumByYear('amount', 5)
   *   .trends();
   * ```
   */
  sumByYear(column: string, count = 0): this {
    return this.sum(column).byYear(count);
  }

  /** Shorthand for {@link average} + {@link byDay}. */
  averageByDay(column: string, count = 0): this {
    return this.average(column).byDay(count);
  }

  /** Shorthand for {@link average} + {@link byWeek}. */
  averageByWeek(column: string, count = 0): this {
    return this.average(column).byWeek(count);
  }

  /** Shorthand for {@link average} + {@link byMonth}. */
  averageByMonth(column: string, count = 0): this {
    return this.average(column).byMonth(count);
  }

  /** Shorthand for {@link average} + {@link byYear}. */
  averageByYear(column: string, count = 0): this {
    return this.average(column).byYear(count);
  }

  /** Shorthand for {@link max} + {@link byDay}. */
  maxByDay(column: string, count = 0): this {
    return this.max(column).byDay(count);
  }

  /** Shorthand for {@link max} + {@link byWeek}. */
  maxByWeek(column: string, count = 0): this {
    return this.max(column).byWeek(count);
  }

  /** Shorthand for {@link max} + {@link byMonth}. */
  maxByMonth(column: string, count = 0): this {
    return this.max(column).byMonth(count);
  }

  /** Shorthand for {@link max} + {@link byYear}. */
  maxByYear(column: string, count = 0): this {
    return this.max(column).byYear(count);
  }

  /** Shorthand for {@link min} + {@link byDay}. */
  minByDay(column: string, count = 0): this {
    return this.min(column).byDay(count);
  }

  /** Shorthand for {@link min} + {@link byWeek}. */
  minByWeek(column: string, count = 0): this {
    return this.min(column).byWeek(count);
  }

  /** Shorthand for {@link min} + {@link byMonth}. */
  minByMonth(column: string, count = 0): this {
    return this.min(column).byMonth(count);
  }

  /** Shorthand for {@link min} + {@link byYear}. */
  minByYear(column: string, count = 0): this {
    return this.min(column).byYear(count);
  }

  /** Shorthand for {@link count} + {@link between}. */
  countBetween([start, end]: [string, string], column = 'id'): this {
    return this.count(column).between(start, end);
  }

  /** Shorthand for {@link sum} + {@link between}. */
  sumBetween([start, end]: [string, string], column: string): this {
    return this.sum(column).between(start, end);
  }

  /** Shorthand for {@link average} + {@link between}. */
  averageBetween([start, end]: [string, string], column: string): this {
    return this.average(column).between(start, end);
  }

  /** Shorthand for {@link max} + {@link between}. */
  maxBetween([start, end]: [string, string], column: string): this {
    return this.max(column).between(start, end);
  }

  /** Shorthand for {@link min} + {@link between}. */
  minBetween([start, end]: [string, string], column: string): this {
    return this.min(column).between(start, end);
  }

  /** Shorthand for {@link count} + {@link from}. */
  countFrom(date: string, column = 'id'): this {
    return this.count(column).from(date);
  }

  /** Shorthand for {@link sum} + {@link from}. */
  sumFrom(date: string, column: string): this {
    return this.sum(column).from(date);
  }

  /** Shorthand for {@link average} + {@link from}. */
  averageFrom(date: string, column: string): this {
    return this.average(column).from(date);
  }

  /** Shorthand for {@link max} + {@link from}. */
  maxFrom(date: string, column: string): this {
    return this.max(column).from(date);
  }

  /** Shorthand for {@link min} + {@link from}. */
  minFrom(date: string, column: string): this {
    return this.min(column).from(date);
  }

  // --- Terminals ----------------------------------------------------------

  /**
   * Execute the query and return a single aggregate value.
   * @returns The aggregate value, or `0` when no rows match.
   *
   * @example
   * ```ts
   * const total = await Metrics.query(orderRepo.createQueryBuilder('order'))
   *   .sum('amount')
   *   .metrics();
   * ```
   */
  async metrics(): Promise<number> {
    const params: Record<string, unknown> = {};
    const where = this.buildFilters(params);
    this.applyTz(params);

    const plan: QueryPlan = {
      select: [{ expr: this.dialect.aggregate(this.aggregateFn, this.column), alias: 'data' }],
      where,
      params,
      tz: this.tzActive() ? this.timezone : undefined,
    };

    const rows = await this.withCache(plan, () => this.backend.run(plan));
    return normalizeData(rows[0]?.data);
  }

  /**
   * Generate the current metric plus its variation against the period
   * `previousCount` units ago.
   *
   * @param previousCount - How many periods back the comparison window sits (must be `> 0`).
   * @param previousPeriod - The period unit to step back by; one of {@link Period}'s day/week/month/year.
   * @param inPercent - When `true`, express the variation value as a percentage string.
   * @returns The current count plus a typed (`increase`/`decrease`/`none`) variation.
   * @throws {@link InvalidPeriodException} when `previousPeriod` is not a day/week/month/year period.
   * @throws {@link InvalidVariationsCountException} when `previousCount` is not greater than `0`.
   */
  async metricsWithVariations(
    previousCount: number,
    previousPeriod: Period,
    inPercent = false,
  ): Promise<VariationResult> {
    if (!VARIATION_PERIODS.includes(previousPeriod)) {
      throw new InvalidPeriodException(previousPeriod);
    }
    if (previousCount <= 0) {
      throw new InvalidVariationsCountException();
    }

    const previous = this.baseClone();
    previous.period = previousPeriod;
    previous.windowCount = previousCount;
    shiftReference(previous, previousPeriod, previousCount);

    const count = await this.metrics();
    const prior = await previous.metrics();

    const diff = count - prior;
    const type = diff > 0 ? 'increase' : diff < 0 ? 'decrease' : 'none';

    let value: number | string = Math.abs(diff);
    if (type !== 'none' && inPercent && prior > 0) {
      value = `${Math.round((Math.abs(diff) / prior) * 100 * 100) / 100}%`;
    }
    if (type === 'none') {
      value = 0;
    }

    return { count, variation: { type, value } };
  }

  /**
   * Execute the query and return a chart-ready time series. Returns a
   * {@link GroupedTrendsResult} when {@link groupData} was used, otherwise a
   * {@link TrendsResult}; both are empty when no rows match.
   *
   * @param inPercent - When `true`, convert each data point to its percentage of the series total.
   * @returns Parallel `labels`/`data` arrays ready to feed a chart.
   *
   * @example
   * ```ts
   * const { labels, data } = await Metrics.query(orderRepo.createQueryBuilder('order'))
   *   .countByMonth()
   *   .trends();
   * ```
   */
  async trends(inPercent = false): Promise<TrendsResult | GroupedTrendsResult> {
    if (this.groupedLabels.length > 0) {
      return this.groupedTrends(inPercent);
    }

    const rows = await this.trendsData();
    const formatter = new TrendsFormatter(new LabelFormatter(this.locale));
    const ctx = { year: this.year, month: this.month };

    let series: TrendsResult;
    if (this.fill && this.isPeriodMode()) {
      // Date periods: fill the integer buckets, then format the labels.
      series = formatter.format(gapFillRaw(rows, this.missingValue), this.period, ctx);
    } else {
      // Category (labelColumn) and range labels are already final strings.
      const labelPeriod = this.labelColumnName || this.range ? null : this.period;
      series = formatter.format(rows, labelPeriod, ctx);
      if (this.fill) {
        series = populate(await this.canonicalLabels(), series, this.missingValue);
      }
    }

    return inPercent ? toPercent(series) : series;
  }

  /** True when grouping by a date period (not a categorical column or range). */
  private isPeriodMode(): boolean {
    return this.period !== null && !this.labelColumnName && !this.range;
  }

  /** Canonical ordered labels for fillMissingData in range / categorical mode. */
  private async canonicalLabels(): Promise<(string | number)[]> {
    if (this.range) {
      return enumerateBuckets(this.range.start, this.range.end, this.groupBy);
    }
    // Categorical (labelColumn): explicit labels, else distinct values.
    if (this.missingLabels.length > 0) {
      return this.missingLabels;
    }
    const plan: QueryPlan = {
      select: [{ expr: this.labelColumnName as string, alias: 'label' }],
      where: [],
      distinct: true,
      orderBy: { expr: 'label', dir: 'ASC' },
      params: {},
    };
    const rows = await this.backend.run(plan);
    return rows.map((row) => normalizeLabel(row.label));
  }

  /** Build the multi-series GroupedTrendsResult for groupData(). */
  private async groupedTrends(inPercent: boolean): Promise<GroupedTrendsResult> {
    const rows = await this.trendsData();
    const byLabel = new Map(rows.map((row) => [String(row.label), row]));
    const canonical = await this.groupedCanonical(rows);

    const labelFormatter = new LabelFormatter(this.locale);
    const ctx = { year: this.year, month: this.month };
    const labelPeriod = this.labelColumnName || this.range ? null : this.period;
    const labels = canonical.map((label) => labelFormatter.format(label, labelPeriod, ctx));

    const seriesFor = (field: string): number[] => {
      const values = canonical.map((label) => {
        const raw = byLabel.get(String(label));
        const row = isRecord(raw) ? raw : undefined;
        return row ? Number(row[field]) : this.missingValue;
      });
      return inPercent ? percentArray(values) : values;
    };

    const data: GroupedTrendsResult['data'] = { total: seriesFor('data') };
    this.groupedLabels.forEach((label, i) => {
      data[String(label)] = seriesFor(`data${i}`);
    });

    return { labels, data };
  }

  /** Canonical raw labels (shared by every series) for grouped trends. */
  private async groupedCanonical(rows: RawTrendRow[]): Promise<(string | number)[]> {
    if (!this.fill) {
      return rows.map((row) => normalizeLabel(row.label));
    }
    if (this.range || this.labelColumnName) {
      return this.canonicalLabels();
    }
    // Date period: integer buckets from the smallest to the largest present.
    return presentIntegerLabels(rows);
  }

  private async trendsData(): Promise<RawTrendRow[]> {
    const params: Record<string, unknown> = {};
    const select: SelectItem[] = [
      { expr: this.dialect.aggregate(this.aggregateFn, this.column), alias: 'data' },
      { expr: this.labelExpr(), alias: 'label' },
    ];
    this.appendGroupedData(select, params);
    const where = this.buildFilters(params);
    this.applyTz(params);

    const plan: QueryPlan = {
      select,
      where,
      groupBy: 'label',
      orderBy: { expr: 'label', dir: 'ASC' },
      params,
      tz: this.tzActive() ? this.timezone : undefined,
    };

    const rows = await this.withCache(plan, () => this.backend.run(plan));
    return rows.map(toTrendRow);
  }

  /**
   * Add one CASE-based aggregate per group label, so each trend row carries a
   * `data{i}` column with the per-group value. Group values are bound as
   * parameters (never interpolated).
   */
  private appendGroupedData(select: SelectItem[], params: Record<string, unknown>): void {
    this.groupedLabels.forEach((value, i) => {
      const key = `nm_g${i}`;
      params[key] = value;
      select.push({
        expr: `${this.groupedAggregate}(CASE WHEN ${this.column} = :${key} THEN 1 ELSE 0 END)`,
        alias: `data${i}`,
      });
    });
  }

  /** The SQL expression used as the grouped trend label. */
  private labelExpr(): string {
    if (this.labelColumnName) {
      return this.labelColumnName;
    }
    if (this.range) {
      return this.dialect.dateBucket(this.groupBy, this.dateExpr());
    }
    if (this.period) {
      return this.dialect.periodExpr(PERIOD_TO_DATE_PART[this.period], this.dateExpr());
    }
    return this.dateExpr();
  }

  /**
   * The date-column SQL expression, timezone-converted when a non-UTC timezone
   * is configured so that date parts are extracted in local time.
   */
  private dateExpr(): string {
    if (this.timezone === DEFAULT_TIMEZONE) {
      return this.dateColumnRef;
    }
    return this.dialect.convertTz(this.dateColumnRef, ':nm_tz');
  }

  /** Whether a non-UTC timezone is configured. */
  private tzActive(): boolean {
    return this.timezone !== DEFAULT_TIMEZONE;
  }

  /** Bind the timezone parameter when a non-UTC timezone is configured. */
  private applyTz(params: Record<string, unknown>): void {
    if (this.tzActive()) {
      params.nm_tz = this.timezone;
    }
  }

  /**
   * Build the WHERE fragments that scope the query to the configured
   * period/range, collecting their bound values into `params`.
   */
  private buildFilters(params: Record<string, unknown>): string[] {
    const where: string[] = [];
    if (this.range) {
      params.nm_start = this.range.start;
      params.nm_end = this.range.end;
      where.push(
        `${this.dialect.dateBucket('day', this.dateExpr())} BETWEEN :nm_start AND :nm_end`,
      );
    } else {
      switch (this.period) {
        case Period.DAY:
          this.eqFilter(where, params, 'year', this.year);
          this.eqFilter(where, params, 'month', this.month);
          this.windowFilter(where, params, 'day', this.day, () => this.resolver().dayPeriod());
          break;
        case Period.WEEK:
          this.eqFilter(where, params, 'year', this.year);
          this.eqFilter(where, params, 'month', this.month);
          this.windowFilter(where, params, 'week', this.week, () => this.resolver().weekPeriod());
          break;
        case Period.MONTH:
          this.eqFilter(where, params, 'year', this.year);
          this.windowFilter(where, params, 'month', this.month, () =>
            this.resolver().monthPeriod(),
          );
          break;
        case Period.YEAR:
          this.windowFilter(where, params, 'year', this.year, () => [
            this.year - this.windowCount,
            this.year,
          ]);
          break;
      }
    }
    if (this.extraFilters) {
      where.push(...this.extraFilters.fragments);
      Object.assign(params, this.extraFilters.params);
    }
    return where;
  }

  private windowFilter(
    where: string[],
    params: Record<string, unknown>,
    part: DatePart,
    single: number,
    window: () => [number, number],
  ): void {
    if (this.windowCount === 1) {
      this.eqFilter(where, params, part, single);
    } else if (this.windowCount > 1) {
      this.betweenFilter(where, params, part, window());
    }
  }

  private eqFilter(
    where: string[],
    params: Record<string, unknown>,
    part: DatePart,
    value: number,
  ): void {
    const key = `nm_${part}`;
    params[key] = value;
    where.push(`${this.dialect.periodExpr(part, this.dateExpr())} = :${key}`);
  }

  private betweenFilter(
    where: string[],
    params: Record<string, unknown>,
    part: DatePart,
    [start, end]: [number, number],
  ): void {
    const lo = `nm_${part}_lo`;
    const hi = `nm_${part}_hi`;
    params[lo] = start;
    params[hi] = end;
    where.push(`${this.dialect.periodExpr(part, this.dateExpr())} BETWEEN :${lo} AND :${hi}`);
  }

  private resolver(): PeriodResolver {
    return new PeriodResolver(
      { year: this.year, month: this.month, day: this.day, week: this.week },
      this.windowCount,
    );
  }

  /**
   * Execute the callback, returning a cached value when available for the
   * given query plan. A no-op when caching is not enabled on this builder.
   */
  private async withCache<T>(plan: QueryPlan, execute: () => Promise<T>): Promise<T> {
    if (!this.caching || !this.cacheStore) {
      return execute();
    }
    const key = planCacheKey(plan);
    const cached = this.cacheStore.get<T>(key);
    if (cached !== undefined) {
      return cached;
    }
    const result = await execute();
    this.cacheStore.set(key, result, this.caching.ttl);
    return result;
  }
}

function today(): string {
  // Local date, matching the local-time basis used for the period reference.
  const d = new Date();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

const VARIATION_PERIODS: Period[] = [Period.DAY, Period.WEEK, Period.MONTH, Period.YEAR];

/** Pin a builder's reference point to `count` periods before now. */
function shiftReference<T extends ObjectLiteral>(
  builder: MetricsBuilder<T>,
  period: Period,
  count: number,
): void {
  const ago = DateTime.now();
  switch (period) {
    case Period.DAY:
      builder.forDay(ago.minus({ days: count }).day);
      break;
    case Period.WEEK:
      builder.forWeek(ago.minus({ weeks: count }).weekNumber);
      break;
    case Period.MONTH:
      builder.forMonth(ago.minus({ months: count }).month);
      break;
    case Period.YEAR:
      builder.forYear(ago.minus({ years: count }).year);
      break;
  }
}

/** ISO-8601 week number for a JS Date (matches Luxon/Postgres/MySQL/SQLite). */
function isoWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}
