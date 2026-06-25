/**
 * Coerce a raw aggregate value into a plain number. The executor mode runs SQL
 * through drivers that each type the same value differently — Prisma returns
 * COUNT as BigInt and sums as Decimal-like objects, node-postgres returns
 * numerics as strings — so this is the single boundary that hands clean numbers
 * to the formatter. Null/undefined (no rows) become 0, matching the metrics()
 * contract.
 */
export function normalizeData(value: unknown): number {
  if (value === null || value === undefined) {
    return 0;
  }
  return toNumber(value);
}

/**
 * Coerce a raw trend label. Period parts (year/month/...) arrive as integers,
 * but some drivers stringify them (node-postgres) or widen them to BigInt
 * (Prisma); those must become numbers so the integer buckets match. Genuine
 * string labels — date buckets like `2026-01` and categorical values like
 * `paid` — are left untouched.
 */
export function normalizeLabel(value: unknown): string | number {
  if (typeof value === 'bigint') {
    return Number(value);
  }
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'string') {
    return isNumeric(value) ? Number(value) : value;
  }
  if (value instanceof Date) {
    // Defensive: a driver that hands back a Date for a bucket column would
    // otherwise leak an object into the formatter. Our SQL emits string date
    // buckets, so this is a safety net, normalized to a stable YYYY-MM-DD.
    return value.toISOString().slice(0, 10);
  }
  return String(value);
}

function toNumber(value: unknown): number {
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'bigint') {
    return Number(value);
  }
  // Decimal-like objects (Prisma.Decimal, etc.) and numeric strings.
  return Number(typeof value === 'string' ? value : String(value));
}

/** A string that represents a finite decimal/integer number. */
function isNumeric(value: string): boolean {
  if (value.trim() === '') {
    return false;
  }
  return Number.isFinite(Number(value));
}
