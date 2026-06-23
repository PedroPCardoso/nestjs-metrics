import { Period } from '../enums/period.enum';
import { TrendsResult } from '../types';
import { LabelFormatter } from './label-formatter';

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

  format(rows: RawTrendRow[], period: Period | null): TrendsResult {
    const result: TrendsResult = { labels: [], data: [] };

    for (const row of rows) {
      result.labels.push(this.labels.format(row.label, period));
      result.data.push(Number(row.data));
    }

    return result;
  }
}
