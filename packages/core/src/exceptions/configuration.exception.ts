import { MetricsError, MetricsErrorContext } from './metrics.error';

/**
 * Thrown when the library is misconfigured by the developer (e.g. an unsupported
 * driver, or a dialect that cannot be auto-detected). Always carries an
 * actionable `suggestion` describing how to fix it.
 */
export class ConfigurationError extends MetricsError {
  public readonly suggestion: string;

  constructor(message: string, suggestion: string, context?: MetricsErrorContext) {
    super(message, 'CONFIGURATION_ERROR', { ...context, suggestion });
    this.name = 'ConfigurationError';
    this.suggestion = suggestion;
  }
}
