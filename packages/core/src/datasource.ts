import type { ExecutorSpec as ZodExecutorSpec } from './options.schema';

/** One raw result row, keyed by select alias. */
export type Row = Record<string, unknown>;

/** Execute a parameterized SQL statement and return the raw rows. */
export type SqlExecutor = (sql: string, params: unknown[]) => Promise<Row[]>;

/** The three SQL dialects the executor mode emits for. */
export type SupportedDialect = 'postgres' | 'mysql' | 'sqlite';

/**
 * The ORM-agnostic execution boundary. An adapter (Prisma, Drizzle, …) supplies
 * the dialect and a function that runs the emitted SQL through its own client.
 */
export interface DataSource {
  dialect: SupportedDialect;
  execute: SqlExecutor;
}

/**
 * Declares the source the executor-mode builder reads from: a table plus the
 * date/value columns, with an optional raw `from` fragment as the escape hatch
 * for joins/subqueries the structured shape can't express.
 */
export type ExecutorSpec = ZodExecutorSpec;
