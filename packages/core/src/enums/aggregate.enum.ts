/** The SQL aggregate functions a metrics query can apply. */
export enum Aggregate {
  /** `COUNT(...)` — number of rows. */
  COUNT = 'count',
  /** `AVG(...)` — mean of the column. */
  AVERAGE = 'avg',
  /** `SUM(...)` — total of the column. */
  SUM = 'sum',
  /** `MAX(...)` — largest value of the column. */
  MAX = 'max',
  /** `MIN(...)` — smallest value of the column. */
  MIN = 'min',
}
