/** Thrown when an unsupported period is used (e.g. in `metricsWithVariations`). */
export class InvalidPeriodException extends Error {
  constructor(period?: unknown) {
    super(`nestjs-metrics: invalid period${period === undefined ? '' : ` "${String(period)}"`}`);
    this.name = 'InvalidPeriodException';
  }
}
