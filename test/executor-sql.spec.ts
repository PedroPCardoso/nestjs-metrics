import { describe, expect, it } from 'vitest';
import { MetricsBuilder } from '../src/metrics.builder';
import { DataSource, Row, SupportedDialect } from '../src/datasource';

/**
 * DB-free structural guard: pin the raw SQL + positional params the executor
 * backend emits, so placeholder style ($n vs ?) and identifier quoting are
 * caught without a live database.
 */
function capture(dialect: SupportedDialect): { ds: DataSource; calls: { sql: string; params: unknown[] }[] } {
  const calls: { sql: string; params: unknown[] }[] = [];
  const ds: DataSource = {
    dialect,
    execute: async (sql, params): Promise<Row[]> => {
      calls.push({ sql, params });
      return [];
    },
  };
  return { ds, calls };
}

describe('executor SQL emission', () => {
  it('emits a bare aggregate with no WHERE and quoted identifiers', async () => {
    const { ds, calls } = capture('sqlite');
    await MetricsBuilder.queryExecutor(ds, { table: 'orders' }).count().metrics();
    expect(calls[0].sql).toBe('SELECT count("orders"."id") AS "data" FROM "orders"');
    expect(calls[0].params).toEqual([]);
  });

  it('uses ? placeholders for SQLite/MySQL', async () => {
    const { ds, calls } = capture('mysql');
    await MetricsBuilder.queryExecutor(ds, { table: 'orders', dateColumn: 'created_at' })
      .sumByMonth('amount')
      .forYear(2026)
      .trends();
    expect(calls[0].sql).toContain('FROM `orders`');
    expect(calls[0].sql).toContain('WHERE year(`orders`.`created_at`) = ?');
    expect(calls[0].sql).toContain('GROUP BY label ORDER BY label ASC');
    expect(calls[0].params).toEqual([2026]);
  });

  it('uses $n placeholders and double-quoted identifiers for Postgres', async () => {
    const { ds, calls } = capture('postgres');
    await MetricsBuilder.queryExecutor(ds, { table: 'orders', dateColumn: 'created_at' })
      .sumByMonth('amount', 2)
      .forYear(2026)
      .forMonth(6)
      .trends();
    expect(calls[0].sql).toContain('FROM "orders"');
    expect(calls[0].sql).toContain('WHERE EXTRACT(YEAR FROM "orders"."created_at") = $1');
    expect(calls[0].sql).toContain('BETWEEN $2 AND $3');
    expect(calls[0].params).toEqual([2026, 4, 6]);
  });
});
