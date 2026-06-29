import { MetricsError, MetricsErrorContext } from './metrics.error';

/**
 * Thrown when the underlying database driver rejects a query. It wraps the raw
 * driver error (preserved on `cause`) and attaches the SQL, bound parameters and
 * dialect that produced it, so the failure is actionable instead of an opaque
 * driver message bubbling up from deep in the executor.
 */
export class QueryExecutionError extends MetricsError {
  constructor(cause: unknown, context: MetricsErrorContext) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    super(
      `nestjs-metrics: query execution failed: ${reason}`,
      'QUERY_EXECUTION_ERROR',
      context,
      { cause },
    );
    this.name = 'QueryExecutionError';
  }
}
