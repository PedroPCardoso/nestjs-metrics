import { MetricsError } from './metrics.error';

/** Thrown when a column/table name is not a plain SQL identifier (the injection guard). */
export class InvalidIdentifierException extends MetricsError {
  constructor(identifier: string) {
    super(
      `nestjs-metrics: invalid identifier "${identifier}" — column/table names must match ` +
        `[a-zA-Z_][a-zA-Z0-9_.]*. Use a developer-controlled identifier, not user input.`,
      'INVALID_IDENTIFIER',
      { column: identifier },
    );
    this.name = 'InvalidIdentifierException';
  }
}
