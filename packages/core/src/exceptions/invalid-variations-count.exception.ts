import { MetricsError } from './metrics.error';

export class InvalidVariationsCountException extends MetricsError {
  constructor() {
    super(
      'nestjs-metrics: the variations count must be greater than 0',
      'INVALID_VARIATIONS_COUNT',
      { suggestion: 'Pass a count greater than 0.' },
    );
    this.name = 'InvalidVariationsCountException';
  }
}
