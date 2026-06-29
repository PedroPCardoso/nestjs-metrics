/**
 * Structured, optional context attached to every {@link MetricsError}. Fields are
 * all optional so each error can carry only what is relevant (a validation error
 * has a `column`, a query failure has a `query`, a configuration error has a
 * `suggestion`). The index signature leaves room for error-specific extras.
 */
export interface MetricsErrorContext {
  /** The SQL that was being executed, when known. */
  query?: string;
  /** The bound parameters for `query`, when known. */
  params?: unknown;
  /** The table involved, when known. */
  table?: string;
  /** The column involved, when known. */
  column?: string;
  /** The operation being performed (e.g. `'execute'`), when known. */
  operation?: string;
  /** The SQL dialect/driver involved, when known. */
  dialect?: string;
  /** An actionable hint for how to fix the problem, when one exists. */
  suggestion?: string;
  [key: string]: unknown;
}

/**
 * Base class for every error thrown by nestjs-metrics. It still extends the native
 * `Error` (so existing `instanceof Error` checks and the typed subclasses keep
 * working), but adds a stable, machine-readable `code` and an optional structured
 * `context` to make failures easier to log, match on, and debug. When wrapping a
 * lower-level failure, the original error is preserved on `cause`.
 */
export class MetricsError extends Error {
  constructor(
    message: string,
    /** A stable, machine-readable error code (e.g. `'QUERY_EXECUTION_ERROR'`). */
    public readonly code: string,
    /** Structured context describing what went wrong. */
    public readonly context?: MetricsErrorContext,
    options?: { cause?: unknown },
  ) {
    super(message);
    this.name = 'MetricsError';
    if (options?.cause !== undefined) {
      (this as { cause?: unknown }).cause = options.cause;
    }
  }
}
