/** Thrown when the variations count passed to `metricsWithVariations` is not greater than 0. */
export class InvalidVariationsCountException extends Error {
  constructor() {
    super('nestjs-metrics: the variations count must be greater than 0');
    this.name = 'InvalidVariationsCountException';
  }
}
