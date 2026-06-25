import Database from 'better-sqlite3';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prismaMetrics, type PrismaClientLike } from '@pedropcardoso/metrics-nextjs/prisma';
import { drizzleMetrics, type DrizzleClientLike } from '@pedropcardoso/metrics-nextjs/drizzle';

/**
 * The Prisma and Drizzle adapters are thin wrappers over the core executor.
 * We back each one's real client contract ($queryRawUnsafe / $client) with an
 * actual SQLite database, so the emitted SQL runs for real and both adapters
 * must agree.
 */
describe('nextjs adapters (Prisma + Drizzle over SQLite)', () => {
  let db: Database.Database;
  let prisma: PrismaClientLike;
  let drizzle: DrizzleClientLike;

  beforeAll(() => {
    db = new Database(':memory:');
    db.exec(
      'CREATE TABLE orders (id INTEGER PRIMARY KEY, amount REAL, status TEXT, created_at TEXT)',
    );
    const insert = db.prepare(
      'INSERT INTO orders (amount, status, created_at) VALUES (?, ?, ?)',
    );
    for (const [amount, status, date] of [
      [100, 'paid', '2026-01-10'],
      [50, 'pending', '2026-01-20'],
      [200, 'paid', '2026-02-05'],
      [75, 'refunded', '2026-02-15'],
      [300, 'paid', '2026-03-01'],
      [25, 'pending', '2026-03-20'],
      [150, 'paid', '2026-05-11'],
    ] as [number, string, string][]) {
      insert.run(amount, status, date);
    }

    // Faithful fakes of each client's exact contract, backed by real SQLite.
    prisma = {
      $queryRawUnsafe: async <T>(sql: string, ...params: unknown[]) =>
        db.prepare(sql).all(...params) as T,
    };
    drizzle = { $client: db };
  });

  afterAll(() => db.close());

  const spec = { table: 'orders', dateColumn: 'created_at', dialect: 'sqlite' as const };

  it('prisma adapter: count and sum', async () => {
    expect(await prismaMetrics(prisma, spec).count().metrics()).toBe(7);
    expect(await prismaMetrics(prisma, spec).sum('amount').metrics()).toBe(900);
  });

  it('drizzle adapter: count and sum', async () => {
    expect(await drizzleMetrics(drizzle, spec).count().metrics()).toBe(7);
    expect(await drizzleMetrics(drizzle, spec).sum('amount').metrics()).toBe(900);
  });

  it('structured where flows through both adapters', async () => {
    const paid = { ...spec, where: { status: 'paid' } };
    expect(await prismaMetrics(prisma, paid).sum('amount').metrics()).toBe(750);
    expect(await drizzleMetrics(drizzle, paid).sum('amount').metrics()).toBe(750);
  });

  it('both adapters agree on monthly trends', async () => {
    const fromPrisma = await prismaMetrics(prisma, spec)
      .sumByMonth('amount')
      .forYear(2026)
      .fillMissingData()
      .trends();
    const fromDrizzle = await drizzleMetrics(drizzle, spec)
      .sumByMonth('amount')
      .forYear(2026)
      .fillMissingData()
      .trends();
    expect(fromPrisma).toEqual(fromDrizzle);
    expect((fromPrisma as { data: number[] }).data.slice(0, 5)).toEqual([150, 275, 325, 0, 150]);
  });
});
