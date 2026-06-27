import { MetricsError } from './metrics.error';

export class InvalidAggregateException extends MetricsError {
  constructor(aggregate?: unknown) {
    super(
      `nestjs-metrics: invalid aggregate${aggregate === undefined ? '' : ` "${String(aggregate)}"`}`,
      'INVALID_AGGREGATE',
      { operation: 'aggregate' },
    );
    this.name = 'InvalidAggregateException';
  }
}
