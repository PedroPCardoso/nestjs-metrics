import { DateTime } from 'luxon';
import { DatePart } from '../dialects/sql-dialect.interface';

function bucketString(dt: DateTime, part: DatePart): string {
  switch (part) {
    case 'day':
      return dt.toFormat('yyyy-MM-dd');
    case 'month':
      return dt.toFormat('yyyy-MM');
    case 'year':
      return dt.toFormat('yyyy');
    case 'week':
      return `${dt.weekYear}-W${String(dt.weekNumber).padStart(2, '0')}`;
  }
}

/**
 * Enumerate every bucket label in [start, end] at the given granularity, in
 * order. The strings match the per-dialect dateBucket() SQL output, so they
 * merge cleanly with a trend series.
 */
export function enumerateBuckets(start: string, end: string, part: DatePart): string[] {
  let cur = DateTime.fromISO(start).startOf(part);
  const last = DateTime.fromISO(end);
  const seen = new Set<string>();
  const out: string[] = [];

  while (cur <= last) {
    const bucket = bucketString(cur, part);
    if (!seen.has(bucket)) {
      seen.add(bucket);
      out.push(bucket);
    }
    cur = cur.plus({ [part]: 1 });
  }

  return out;
}
