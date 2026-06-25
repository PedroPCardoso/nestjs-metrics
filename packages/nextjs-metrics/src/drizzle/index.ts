import type { Column, Table } from 'drizzle-orm';
import {
  MetricsBuilder,
  type ExecutorSpec,
  type MetricsOptions,
  type Row,
  type SqlExecutor,
  type SupportedDialect,
} from 'nestjs-metrics-core';

/**
 * A Drizzle db exposes the underlying driver as `$client`. Duck-typed so the
 * shape works across drivers; the raw SQL the core emits is run through it.
 */
export interface DrizzleClientLike {
  $client: unknown;
}

export interface DrizzleMetricsSpec extends Omit<ExecutorSpec, 'table' | 'dateColumn'> {
  /** A Drizzle table object (names + dialect derived from it) or a raw table name. */
  table: string | Table;
  /** A Drizzle column object or a raw column name. */
  dateColumn?: string | Column;
  /** Optional: auto-detected from a typed table; required when `table` is a string. */
  dialect?: SupportedDialect;
}

/**
 * Build a metrics query over a Drizzle db. Pass the typed table/column objects
 * for compile-time safety and dialect auto-detection, or plain strings plus an
 * explicit `dialect`.
 */
export function drizzleMetrics(
  db: DrizzleClientLike,
  spec: DrizzleMetricsSpec,
  options?: MetricsOptions,
): MetricsBuilder<Record<string, unknown>> {
  const dialect = resolveDialect(spec);
  const source: ExecutorSpec = {
    table: tableName(spec.table),
    dateColumn: spec.dateColumn === undefined ? undefined : columnName(spec.dateColumn),
    where: spec.where,
    from: spec.from,
  };
  return MetricsBuilder.queryExecutor<Record<string, unknown>>(
    { dialect, execute: drizzleExecutor(dialect, db.$client) },
    source,
    options,
  );
}

/** Lazily load drizzle-orm — only needed when a typed table object is passed. */
function drizzleHelpers(): typeof import('drizzle-orm') {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('drizzle-orm') as typeof import('drizzle-orm');
}

function tableName(table: string | Table): string {
  return typeof table === 'string' ? table : drizzleHelpers().getTableName(table);
}

function columnName(column: string | Column): string {
  return typeof column === 'string' ? column : column.name;
}

function resolveDialect(spec: DrizzleMetricsSpec): SupportedDialect {
  if (spec.dialect) {
    return spec.dialect;
  }
  if (typeof spec.table !== 'string') {
    const detected = detectDialect(spec.table);
    if (detected) {
      return detected;
    }
  }
  throw new Error(
    'drizzleMetrics: pass `dialect` explicitly when `table` is a string (it cannot be auto-detected).',
  );
}

/** Infer the dialect from a Drizzle column's brand (e.g. `SQLiteText` → sqlite). */
function detectDialect(table: Table): SupportedDialect | undefined {
  const columns = Object.values(drizzleHelpers().getTableColumns(table));
  const brand = columns[0]?.columnType ?? '';
  if (brand.startsWith('SQLite')) return 'sqlite';
  if (brand.startsWith('Pg')) return 'postgres';
  if (brand.startsWith('MySql')) return 'mysql';
  return undefined;
}

function drizzleExecutor(dialect: SupportedDialect, client: unknown): SqlExecutor {
  if (dialect === 'sqlite') {
    const sqlite = client as { prepare(sql: string): { all(...params: unknown[]): unknown[] } };
    return async (sql, params) => sqlite.prepare(sql).all(...params) as Row[];
  }
  if (dialect === 'postgres') {
    const pg = client as { query(sql: string, params: unknown[]): Promise<{ rows: Row[] }> };
    return async (sql, params) => (await pg.query(sql, params)).rows;
  }
  const mysql = client as { query(sql: string, params: unknown[]): Promise<[Row[], unknown]> };
  return async (sql, params) => (await mysql.query(sql, params))[0];
}
