import { DateTime } from 'luxon';
import { ObjectLiteral, SelectQueryBuilder } from 'typeorm';
import { Aggregate } from './enums/aggregate.enum';
import { Period } from './enums/period.enum';
import { InvalidPeriodException } from './exceptions/invalid-period.exception';
import { InvalidVariationsCountException } from './exceptions/invalid-variations-count.exception';
import { assertAggregate, assertDateFormat, assertSafeIdentifier } from './validation';
import { dialectFor } from './dialects/dialect.factory';
import { DatePart, SqlDialect } from './dialects/sql-dialect.interface';
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

const DEFAULT_LOCALE = 'en';

/**
 * Fluent builder that turns a TypeORM SelectQueryBuilder into chart-ready
 * metrics and trends. The chain is synchronous; only the terminal methods
 * (metrics, trends) execute against the database and are async.
 */
export class MetricsBuilder<T extends ObjectLiteral> {
  private tableName: string;
  private readonly dialect: SqlDialect;
  private readonly locale: string;
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
  private fill = false;
  private missingValue = 0;
  private missingLabels: (string | number)[] = [];
  private groupedLabels: (string | number)[] = [];
  private groupedAggregate: Aggregate = Aggregate.SUM;
  private now = new Date();
  private year: number = this.now.getFullYear();
  private month: number = this.now.getMonth() + 1;
  private day: number = this.now.getDate();
  private week: number = isoWeek(this.now);

  constructor(
    private readonly qb: SelectQueryBuilder<T>,
    options: MetricsOptions = {},
  ) {
    this.tableName = qb.alias;
    this.dialect = dialectFor(qb.connection.options.type);
    this.locale = options.locale ?? DEFAULT_LOCALE;
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
    return this.qb.connection.driver.escape(name);
  }

  /**
   * A fresh builder over a clone of the query, carrying the aggregate/column
   * state needed for a bare metric. Single place to copy metric-affecting
   * state (extend here when adding new aggregate-relevant fields, e.g. timezone).
   */
  private baseClone(): MetricsBuilder<T> {
    const clone = new MetricsBuilder<T>(this.qb.clone(), { locale: this.locale });
    clone.aggregateFn = this.aggregateFn;
    clone.column = this.column;
    clone.dateColumnRef = this.dateColumnRef;
    clone.tableName = this.tableName;
    return clone;
  }

  static query<T extends ObjectLiteral>(
    qb: SelectQueryBuilder<T>,
    options?: MetricsOptions,
  ): MetricsBuilder<T> {
    return new MetricsBuilder(qb, options);
  }

  // --- Aggregates ---------------------------------------------------------

  private aggregate(fn: Aggregate, column: string): this {
    assertAggregate(fn);
    this.aggregateFn = fn;
    this.column = this.qualify(column);
    return this;
  }

  count(column = 'id'): this {
    return this.aggregate(Aggregate.COUNT, column);
  }

  // --- Targeting ----------------------------------------------------------

  /** Bucket by a date column other than `created_at`. */
  dateColumn(column: string): this {
    this.dateColumnRef = this.qualify(column);
    return this;
  }

  /** Override the table used to qualify subsequent columns (e.g. a joined table). */
  table(name: string): this {
    // Stored raw-but-validated; it is driver-escaped each time qualify() runs.
    assertSafeIdentifier(name);
    this.tableName = name;
    return this;
  }

  /** Group the series by a categorical column instead of by a date period. */
  labelColumn(column: string): this {
    this.labelColumnName = this.qualify(column);
    return this;
  }

  /**
   * Fill gaps in a trend series with a default value (0), auto-discovering the
   * expected labels. An explicit label set can be supplied for categorical
   * series.
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
   * `total` carries the main aggregate per bucket. The result of trends()
   * becomes a GroupedTrendsResult.
   */
  groupData(labels: (string | number)[], aggregate: Aggregate = Aggregate.SUM): this {
    assertAggregate(aggregate);
    this.groupedLabels = labels;
    this.groupedAggregate = aggregate;
    return this;
  }

  sum(column: string): this {
    return this.aggregate(Aggregate.SUM, column);
  }

  average(column: string): this {
    return this.aggregate(Aggregate.AVERAGE, column);
  }

  max(column: string): this {
    return this.aggregate(Aggregate.MAX, column);
  }

  min(column: string): this {
    return this.aggregate(Aggregate.MIN, column);
  }

  // --- Periods ------------------------------------------------------------

  private by(period: Period, count = 0): this {
    this.period = period;
    this.windowCount = count;
    return this;
  }

  byDay(count = 0): this {
    return this.by(Period.DAY, count);
  }

  byWeek(count = 0): this {
    return this.by(Period.WEEK, count);
  }

  byMonth(count = 0): this {
    return this.by(Period.MONTH, count);
  }

  byYear(count = 0): this {
    return this.by(Period.YEAR, count);
  }

  // --- Date ranges --------------------------------------------------------

  between(start: string, end: string): this {
    assertDateFormat(start);
    assertDateFormat(end);
    this.range = { start, end };
    this.period = null;
    return this;
  }

  from(date: string): this {
    return this.between(date, today());
  }

  private setGroupBy(part: DatePart): this {
    this.groupBy = part;
    return this;
  }

  groupByDay(): this {
    return this.setGroupBy('day');
  }

  groupByWeek(): this {
    return this.setGroupBy('week');
  }

  groupByMonth(): this {
    return this.setGroupBy('month');
  }

  groupByYear(): this {
    return this.setGroupBy('year');
  }

  // --- Reference point pinning -------------------------------------------

  forDay(day: number): this {
    this.day = day;
    return this;
  }

  forWeek(week: number): this {
    this.week = week;
    return this;
  }

  forMonth(month: number): this {
    this.month = month;
    return this;
  }

  forYear(year: number): this {
    this.year = year;
    return this;
  }

  // --- Combined shorthands ------------------------------------------------

  countByDay(column = 'id', count = 0): this {
    return this.count(column).byDay(count);
  }

  countByWeek(column = 'id', count = 0): this {
    return this.count(column).byWeek(count);
  }

  countByMonth(column = 'id', count = 0): this {
    return this.count(column).byMonth(count);
  }

  countByYear(column = 'id', count = 0): this {
    return this.count(column).byYear(count);
  }

  sumByDay(column: string, count = 0): this {
    return this.sum(column).byDay(count);
  }

  sumByWeek(column: string, count = 0): this {
    return this.sum(column).byWeek(count);
  }

  sumByMonth(column: string, count = 0): this {
    return this.sum(column).byMonth(count);
  }

  sumByYear(column: string, count = 0): this {
    return this.sum(column).byYear(count);
  }

  averageByDay(column: string, count = 0): this {
    return this.average(column).byDay(count);
  }

  averageByWeek(column: string, count = 0): this {
    return this.average(column).byWeek(count);
  }

  averageByMonth(column: string, count = 0): this {
    return this.average(column).byMonth(count);
  }

  averageByYear(column: string, count = 0): this {
    return this.average(column).byYear(count);
  }

  maxByDay(column: string, count = 0): this {
    return this.max(column).byDay(count);
  }

  maxByWeek(column: string, count = 0): this {
    return this.max(column).byWeek(count);
  }

  maxByMonth(column: string, count = 0): this {
    return this.max(column).byMonth(count);
  }

  maxByYear(column: string, count = 0): this {
    return this.max(column).byYear(count);
  }

  minByDay(column: string, count = 0): this {
    return this.min(column).byDay(count);
  }

  minByWeek(column: string, count = 0): this {
    return this.min(column).byWeek(count);
  }

  minByMonth(column: string, count = 0): this {
    return this.min(column).byMonth(count);
  }

  minByYear(column: string, count = 0): this {
    return this.min(column).byYear(count);
  }

  countBetween([start, end]: [string, string], column = 'id'): this {
    return this.count(column).between(start, end);
  }

  sumBetween([start, end]: [string, string], column: string): this {
    return this.sum(column).between(start, end);
  }

  averageBetween([start, end]: [string, string], column: string): this {
    return this.average(column).between(start, end);
  }

  maxBetween([start, end]: [string, string], column: string): this {
    return this.max(column).between(start, end);
  }

  minBetween([start, end]: [string, string], column: string): this {
    return this.min(column).between(start, end);
  }

  countFrom(date: string, column = 'id'): this {
    return this.count(column).from(date);
  }

  sumFrom(date: string, column: string): this {
    return this.sum(column).from(date);
  }

  averageFrom(date: string, column: string): this {
    return this.average(column).from(date);
  }

  maxFrom(date: string, column: string): this {
    return this.max(column).from(date);
  }

  minFrom(date: string, column: string): this {
    return this.min(column).from(date);
  }

  // --- Terminals ----------------------------------------------------------

  /** Generate a single aggregate value. Returns 0 when there is no data. */
  async metrics(): Promise<number> {
    const qb = this.qb.clone();
    qb.select(this.dialect.aggregate(this.aggregateFn, this.column), 'data');
    this.applyFilters(qb);

    const raw = await qb.getRawOne<{ data: unknown }>();
    const data = raw?.data;
    return data === null || data === undefined ? 0 : Number(data);
  }

  /**
   * Generate the current metric plus its variation against the period
   * `previousCount` units ago.
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

  /** Generate a chart-ready time series. Empty when there is no data. */
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
    const qb = this.qb.clone();
    qb.select(this.labelColumnName as string, 'label').distinct(true).orderBy('label', 'ASC');
    const rows = await qb.getRawMany<{ label: string | number }>();
    return rows.map((row) => row.label);
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
        const row = byLabel.get(String(label)) as Record<string, unknown> | undefined;
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
      return rows.map((row) => row.label as string | number);
    }
    if (this.range || this.labelColumnName) {
      return this.canonicalLabels();
    }
    // Date period: integer buckets from the smallest to the largest present.
    return presentIntegerLabels(rows);
  }

  private async trendsData(): Promise<RawTrendRow[]> {
    const qb = this.qb.clone();
    qb.select(this.dialect.aggregate(this.aggregateFn, this.column), 'data')
      .addSelect(this.labelExpr(), 'label')
      .groupBy('label')
      .orderBy('label', 'ASC');
    this.applyGroupedData(qb);
    this.applyFilters(qb);

    return qb.getRawMany<RawTrendRow>();
  }

  /**
   * Add one CASE-based aggregate per group label, so each trend row carries a
   * `data{i}` column with the per-group value. Group values are bound as
   * parameters (never interpolated).
   */
  private applyGroupedData(qb: SelectQueryBuilder<T>): void {
    this.groupedLabels.forEach((value, i) => {
      const key = `nm_g${i}`;
      qb.addSelect(
        `${this.groupedAggregate}(CASE WHEN ${this.column} = :${key} THEN 1 ELSE 0 END)`,
        `data${i}`,
      ).setParameter(key, value);
    });
  }

  /** The SQL expression used as the grouped trend label. */
  private labelExpr(): string {
    if (this.labelColumnName) {
      return this.labelColumnName;
    }
    if (this.range) {
      return this.dialect.dateBucket(this.groupBy, this.dateColumnRef);
    }
    if (this.period) {
      return this.dialect.periodExpr(this.period as DatePart, this.dateColumnRef);
    }
    return this.dateColumnRef;
  }

  /** Apply the WHERE clauses that scope the query to the configured period/range. */
  private applyFilters(qb: SelectQueryBuilder<T>): void {
    if (this.range) {
      qb.andWhere(
        `${this.dialect.dateBucket('day', this.dateColumnRef)} BETWEEN :nm_start AND :nm_end`,
        { nm_start: this.range.start, nm_end: this.range.end },
      );
      return;
    }
    switch (this.period) {
      case Period.DAY:
        this.whereEquals(qb, 'year', this.year);
        this.whereEquals(qb, 'month', this.month);
        this.applyWindow(qb, 'day', this.day, () => this.resolver().dayPeriod());
        break;
      case Period.WEEK:
        this.whereEquals(qb, 'year', this.year);
        this.whereEquals(qb, 'month', this.month);
        this.applyWindow(qb, 'week', this.week, () => this.resolver().weekPeriod());
        break;
      case Period.MONTH:
        this.whereEquals(qb, 'year', this.year);
        this.applyWindow(qb, 'month', this.month, () => this.resolver().monthPeriod());
        break;
      case Period.YEAR:
        this.applyWindow(qb, 'year', this.year, () => [this.year - this.windowCount, this.year]);
        break;
    }
  }

  private applyWindow(
    qb: SelectQueryBuilder<T>,
    part: DatePart,
    single: number,
    window: () => [number, number],
  ): void {
    if (this.windowCount === 1) {
      this.whereEquals(qb, part, single);
    } else if (this.windowCount > 1) {
      this.whereBetween(qb, part, window());
    }
  }

  private whereEquals(qb: SelectQueryBuilder<T>, part: DatePart, value: number): void {
    const key = `nm_${part}`;
    qb.andWhere(`${this.dialect.periodExpr(part, this.dateColumnRef)} = :${key}`, { [key]: value });
  }

  private whereBetween(
    qb: SelectQueryBuilder<T>,
    part: DatePart,
    [start, end]: [number, number],
  ): void {
    const lo = `nm_${part}_lo`;
    const hi = `nm_${part}_hi`;
    qb.andWhere(`${this.dialect.periodExpr(part, this.dateColumnRef)} BETWEEN :${lo} AND :${hi}`, {
      [lo]: start,
      [hi]: end,
    });
  }

  private resolver(): PeriodResolver {
    return new PeriodResolver(
      { year: this.year, month: this.month, day: this.day, week: this.week },
      this.windowCount,
    );
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
