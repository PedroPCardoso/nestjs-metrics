import { TrendsResult } from '../types';
import { RawTrendRow } from './trends.formatter';

/**
 * Fill gaps in a period series at the raw (pre-format) stage: enumerate every
 * integer bucket between the smallest and largest present bucket, inserting the
 * default value where there is no row. Operating on raw integer labels avoids
 * collisions that formatted labels (e.g. weekday names) could introduce.
 */
export function gapFillRaw(rows: RawTrendRow[], missingValue: number): RawTrendRow[] {
  if (rows.length === 0) {
    return [];
  }

  const present = new Map<number, number>();
  for (const row of rows) {
    present.set(Number(row.label), Number(row.data));
  }

  const labels = [...present.keys()];
  const min = Math.min(...labels);
  const max = Math.max(...labels);

  const out: RawTrendRow[] = [];
  for (let n = min; n <= max; n++) {
    out.push({ label: n, data: present.has(n) ? (present.get(n) as number) : missingValue });
  }
  return out;
}

/**
 * Merge a formatted trend series onto a canonical, ordered set of labels,
 * inserting the default value for any label absent from the series.
 */
export function populate(
  canonicalLabels: (string | number)[],
  series: TrendsResult,
  missingValue: number,
): TrendsResult {
  const present = new Map<string, number>();
  series.labels.forEach((label, i) => present.set(String(label), series.data[i]));

  return {
    labels: canonicalLabels,
    data: canonicalLabels.map((label) =>
      present.has(String(label)) ? (present.get(String(label)) as number) : missingValue,
    ),
  };
}
