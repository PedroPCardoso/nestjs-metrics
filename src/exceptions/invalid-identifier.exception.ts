export class InvalidIdentifierException extends Error {
  constructor(identifier: string) {
    super(
      `nestjs-metrics: invalid identifier "${identifier}" — column/table names must match ` +
        `[a-zA-Z_][a-zA-Z0-9_.]*. Use a developer-controlled identifier, not user input.`,
    );
    this.name = 'InvalidIdentifierException';
  }
}
