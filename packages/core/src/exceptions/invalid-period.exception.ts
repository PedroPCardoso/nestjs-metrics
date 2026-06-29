import { MetricsError } from './metrics.error';

/** Thrown when an unsupported period is used (e.g. in `metricsWithVariations`). */
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
