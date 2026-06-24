import { Aggregate } from '../enums/aggregate.enum';

export type DatePart = 'day' | 'week' | 'month' | 'year';

/**
 * A SqlDialect knows how to express the database-specific SQL fragments the
 * metrics builder needs: the aggregate call and the extraction of a date part
 * from a date column. One implementation exists per supported driver.
 */
export interface SqlDialect {
  /** e.g. `count(orders.id)`, `sum(orders.amount)`. */
  aggregate(fn: Aggregate, column: string): string;

  /** Integer extraction of a date part, e.g. the month number of a column. */
  periodExpr(part: DatePart, column: string): string;

  /**
   * Truncate a date column to a granularity, as a sortable string label:
   * day → `YYYY-MM-DD`, month → `YYYY-MM`, year → `YYYY`, week → `IYYY-Www`.
   * Used to bucket `between` ranges.
   */
  dateBucket(part: DatePart, column: string): string;

  /**
   * Convert a UTC date column to the given timezone (a bound parameter
   * placeholder, e.g. `:nm_tz`), so date parts are extracted in local time.
   */
  convertTz(column: string, tzParam: string): string;

  /**
   * Quote a (pre-validated) identifier for this dialect. Only used by the
   * executor mode — the TypeORM path keeps using the driver's own escaping.
   */
  escapeId(name: string): string;

  /**
   * The positional placeholder for the n-th (1-based) bound parameter:
   * `$n` for Postgres, `?` for MySQL/SQLite.
   */
  placeholder(index: number): string;
}
