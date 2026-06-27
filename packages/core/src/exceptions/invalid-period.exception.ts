import { MetricsError } from './metrics.error';

export class InvalidPeriodException extends MetricsError {
  constructor(period?: unknown) {
    super(
      `nestjs-metrics: invalid period${period === undefined ? '' : ` "${String(period)}"`}`,
      'INVALID_PERIOD',
      { operation: 'period' },
    );
    this.name = 'InvalidPeriodException';
  }
}
