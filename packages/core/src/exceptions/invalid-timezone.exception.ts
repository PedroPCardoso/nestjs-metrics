import { MetricsError } from './metrics.error';

export class InvalidTimezoneException extends MetricsError {
  constructor(timezone: string) {
    super(
      `nestjs-metrics: invalid timezone "${timezone}", expected an IANA name (e.g. America/Sao_Paulo)`,
      'INVALID_TIMEZONE',
      { suggestion: 'Use a valid IANA timezone like America/Sao_Paulo or UTC.' },
    );
    this.name = 'InvalidTimezoneException';
  }
}
