import { MetricsError } from './metrics.error';

export class InvalidDateFormatException extends MetricsError {
  constructor(value: string) {
    super(
      `nestjs-metrics: invalid date "${value}", expected YYYY-MM-DD`,
      'INVALID_DATE_FORMAT',
      { suggestion: 'Pass dates as YYYY-MM-DD strings.' },
    );
    this.name = 'InvalidDateFormatException';
  }
}
