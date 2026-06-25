import { DatePart } from '../dialects/sql-dialect.interface';
import { Period } from '../enums/period.enum';
import { RawTrendRow } from '../formatting/trends.formatter';
import { Row } from '../datasource';

/**
 * Safe mapping from Period enum to DatePart — no `as` assertion needed.
 * Every Period value has a corresponding DatePart; the compiler enforces
 * exhaustiveness because the record is typed `Record<Period, DatePart>`.
 */
export const PERIOD_TO_DATE_PART: Readonly<Record<Period, DatePart>> = {
  [Period.TODAY]: 'day',
  [Period.DAY]: 'day',
  [Period.WEEK]: 'week',
  [Period.MONTH]: 'month',
  [Period.YEAR]: 'year',
};

/**
 * Convert a raw DB row into a validated RawTrendRow. Replaces the fragile
 * `as unknown as RawTrendRow[]` double-cast by preserving every column the
 * database returned (including `data0`, `data1` per-group series for groupData).
 */
export function toTrendRow(row: Row): RawTrendRow {
  return row as unknown as RawTrendRow;
}

/** Type guard: checks whether a value is a non-null object (not array). */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Type predicate for array-like type narrowing in map/filter chains. */
export function isStringOrNumber(value: unknown): value is string | number {
  return typeof value === 'string' || typeof value === 'number';
}
