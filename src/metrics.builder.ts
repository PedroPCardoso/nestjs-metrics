import { ObjectLiteral, SelectQueryBuilder } from 'typeorm';
import { Aggregate } from './enums/aggregate.enum';
import { Period } from './enums/period.enum';
import { dialectFor } from './dialects/dialect.factory';
import { DatePart, SqlDialect } from './dialects/sql-dialect.interface';
import { PeriodResolver } from './dates/period-resolver';
import { enumerateBuckets } from './dates/bucket-series';
import { LabelFormatter } from './formatting/label-formatter';
import { RawTrendRow, TrendsFormatter, toPercent } from './formatting/trends.formatter';
import { gapFillRaw, populate } from './formatting/missing-data';
import { MetricsOptions, TrendsResult } from './types';

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
   * Single choke point that turns a bare column name into a table-qualified
   * identifier. Identifier-safety validation (issue #9) hooks in here so every
   * consumer-supplied identifier passes through exactly one place.
   */
  private qualify(column: string): string {
    return `${this.tableName}.${column}`;
  }

  static query<T extends ObjectLiteral>(
    qb: SelectQueryBuilder<T>,
    options?: MetricsOptions,
  ): MetricsBuilder<T> {
    return new MetricsBuilder(qb, options);
  }

  // --- Aggregates ---------------------------------------------------------

  private aggregate(fn: Aggregate, column: string): this {
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

  /** Generate a chart-ready time series. Empty when there is no data. */
  async trends(inPercent = false): Promise<TrendsResult> {
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

  private async trendsData(): Promise<RawTrendRow[]> {
    const qb = this.qb.clone();
    qb.select(this.dialect.aggregate(this.aggregateFn, this.column), 'data')
      .addSelect(this.labelExpr(), 'label')
      .groupBy('label')
      .orderBy('label', 'ASC');
    this.applyFilters(qb);

    return qb.getRawMany<RawTrendRow>();
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

const DATE_FORMAT = /^\d{4}-\d{2}-\d{2}$/;

/** Validate a YYYY-MM-DD date string. (Typed exceptions arrive in #9.) */
function assertDateFormat(value: string): void {
  if (!DATE_FORMAT.test(value) || Number.isNaN(Date.parse(value))) {
    throw new Error(`nestjs-metrics: invalid date "${value}", expected YYYY-MM-DD`);
  }
}

function today(): string {
  // Local date, matching the local-time basis used for the period reference.
  const d = new Date();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

/** ISO-8601 week number for a JS Date (matches Luxon/Postgres/MySQL/SQLite). */
function isoWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}
