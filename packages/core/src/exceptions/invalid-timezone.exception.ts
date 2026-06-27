/** Thrown when `options.timezone` is not a valid IANA zone name. */
export class InvalidTimezoneException extends Error {
  constructor(timezone: string) {
    super(`nestjs-metrics: invalid timezone "${timezone}", expected an IANA name (e.g. America/Sao_Paulo)`);
    this.name = 'InvalidTimezoneException';
  }
}
