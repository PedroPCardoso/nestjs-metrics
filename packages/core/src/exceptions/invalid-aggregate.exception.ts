/** Thrown when an unsupported aggregate function is requested. */
export class InvalidAggregateException extends Error {
  constructor(aggregate?: unknown) {
    super(
      `nestjs-metrics: invalid aggregate${aggregate === undefined ? '' : ` "${String(aggregate)}"`}`,
    );
    this.name = 'InvalidAggregateException';
  }
}
