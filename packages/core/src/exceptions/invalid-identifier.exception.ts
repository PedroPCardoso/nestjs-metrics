/** Thrown when a column/table name is not a plain SQL identifier (the injection guard). */
export class InvalidIdentifierException extends Error {
  constructor(identifier: string) {
    super(
      `nestjs-metrics: invalid identifier "${identifier}" — column/table names must match ` +
        `[a-zA-Z_][a-zA-Z0-9_.]*. Use a developer-controlled identifier, not user input.`,
    );
    this.name = 'InvalidIdentifierException';
  }
}
