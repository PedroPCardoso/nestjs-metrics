import { Period } from '../enums/period.enum';
import { TrendsResult } from '../types';
import { LabelContext, LabelFormatter } from './label-formatter';

export interface RawTrendRow {
  data: unknown;
  label: unknown;
}

/**
 * Turns the raw `{ data, label }` rows returned by a grouped trends query into
 * the parallel `{ labels, data }` arrays a chart consumes, translating each
 * label through the LabelFormatter.
 */
export class TrendsFormatter {
  constructor(private readonly labels: LabelFormatter) {}

  format(rows: RawTrendRow[], period: Period | null, ctx: LabelContext): TrendsResult {
    const result: TrendsResult = { labels: [], data: [] };

    for (const row of rows) {
      result.labels.push(this.labels.format(row.label, period, ctx));
      result.data.push(Number(row.data));
    }

    return result;
  }
}

/** Convert an array of values to percentages of their total (unchanged if 0). */
export function percentArray(data: number[]): number[] {
  const total = data.reduce((sum, value) => sum + value, 0);
  if (total === 0) {
    return data;
  }
  return data.map((value) => Math.round((value / total) * 100 * 100) / 100);
}

/** Convert a series to percentages of its total (unchanged when the total is 0). */
export function toPercent(result: TrendsResult): TrendsResult {
  return { labels: result.labels, data: percentArray(result.data) };
}
