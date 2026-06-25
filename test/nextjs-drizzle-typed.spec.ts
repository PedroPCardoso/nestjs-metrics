import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { drizzleMetrics } from 'nextjs-metrics';

/**
 * Real drizzle-orm: passing the typed table/column objects lets the adapter
 * derive the SQL names and auto-detect the dialect — no strings, no explicit
 * dialect. Backed by a real better-sqlite3 database.
 */
const orders = sqliteTable('orders', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  amount: real('amount'),
  status: text('status'),
  created_at: text('created_at'),
});

describe('drizzle adapter with typed table input', () => {
  let sqlite: Database.Database;
  let db: ReturnType<typeof drizzle>;

  beforeAll(() => {
    sqlite = new Database(':memory:');
    sqlite.exec(
      'CREATE TABLE orders (id INTEGER PRIMARY KEY AUTOINCREMENT, amount REAL, status TEXT, created_at TEXT)',
    );
    const insert = sqlite.prepare('INSERT INTO orders (amount, status, created_at) VALUES (?, ?, ?)');
    for (const [amount, status, date] of [
      [100, 'paid', '2026-01-10'],
      [200, 'paid', '2026-02-05'],
      [300, 'paid', '2026-03-01'],
      [150, 'pending', '2026-05-11'],
    ] as [number, string, string][]) {
      insert.run(amount, status, date);
    }
    db = drizzle(sqlite);
  });

  afterAll(() => sqlite.close());

  it('derives table/column names and auto-detects the sqlite dialect', async () => {
    // No `dialect` passed — inferred from the typed table.
    const builder = drizzleMetrics(db, { table: orders, dateColumn: orders.created_at });
    expect(await builder.count().metrics()).toBe(4);
    expect(await builder.sum('amount').metrics()).toBe(750);
  });

  it('groups monthly trends from the typed table', async () => {
    const trends = await drizzleMetrics(db, { table: orders, dateColumn: orders.created_at })
      .sumByMonth('amount')
      .forYear(2026)
      .fillMissingData()
      .trends();
    expect((trends as { data: number[] }).data.slice(0, 5)).toEqual([100, 200, 300, 0, 150]);
  });
});
