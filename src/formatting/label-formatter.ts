import { Info } from 'luxon';
import { Period } from '../enums/period.enum';

/**
 * Translates the raw period bucket that comes back from SQL (a month number,
 * day-of-month, week number, or year) into a human-readable, locale-aware
 * label for charts.
 */
export class LabelFormatter {
  constructor(private readonly locale: string) {}

  format(rawLabel: unknown, period: Period | null): string | number {
    switch (period) {
      case Period.MONTH:
        return this.monthName(Number(rawLabel));
      default:
        return rawLabel as string | number;
    }
  }

  private monthName(month: number): string {
    // Info.months is 0-indexed; SQL months are 1-indexed.
    return Info.months('long', { locale: this.locale })[month - 1];
  }
}
