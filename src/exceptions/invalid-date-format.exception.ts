export class InvalidDateFormatException extends Error {
  constructor(value: string) {
    super(`nestjs-metrics: invalid date "${value}", expected YYYY-MM-DD`);
    this.name = 'InvalidDateFormatException';
  }
}
