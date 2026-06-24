import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DataSource as TypeOrmDataSource } from 'typeorm';
import { MetricsBuilder } from '../src/metrics.builder';
import { DataSource } from '../src/datasource';
import { SqliteTimezoneUnsupportedException } from '../src/exceptions/sqlite-timezone-unsupported.exception';
import {
  createOrdersDataSource,
  ordersQuery,
  resetOrders,
  seedOrders,
} from './helpers/orders-datasource';

/**
 * The executor mode must produce byte-identical results to the proven TypeORM
 * path on the same data — same builder state, two backends. We back the
 * ORM-agnostic DataSource with the very same SQLite database (running raw SQL
 * through `typeorm.query`) and assert parity scenario by scenario.
 */
describe('executor mode (SQLite DataSource)', () => {
  let typeorm: TypeOrmDataSource;
  let dataSource: DataSource;

  beforeAll(async () => {
    typeorm = await createOrdersDataSource('better-sqlite3');
    dataSource = {
      dialect: 'sqlite',
      execute: (sql, params) => typeorm.query(sql, params),
    };
    await resetOrders(typeorm);
    await seedOrders(typeorm, [
      { createdAt: '2026-01-10', amount: 100, status: 'paid' },
      { createdAt: '2026-01-20', amount: 50, status: 'pending' },
      { createdAt: '2026-02-05', amount: 200, status: 'paid' },
      { createdAt: '2026-02-15', amount: 75, status: 'refunded' },
      { createdAt: '2026-03-01', amount: 300, status: 'paid' },
      { createdAt: '2026-03-20', amount: 25, status: 'pending' },
      { createdAt: '2026-05-11', amount: 150, status: 'paid' },
    ]);
  });

  afterAll(async () => {
    await typeorm.destroy();
  });

  const exec = () =>
    MetricsBuilder.queryExecutor(dataSource, { table: 'orders', dateColumn: 'created_at' });
  const orm = () => MetricsBuilder.query(ordersQuery(typeorm));

  it('count().metrics() matches the TypeORM path', async () => {
    expect(await exec().count().metrics()).toBe(await orm().count().metrics());
    expect(await exec().count().metrics()).toBe(7);
  });

  it('sum().metrics() matches the TypeORM path', async () => {
    expect(await exec().sum('amount').metrics()).toBe(await orm().sum('amount').metrics());
    expect(await exec().sum('amount').metrics()).toBe(900);
  });

  it('sumByMonth + forYear + fillMissingData trends match', async () => {
    const fromExec = await exec().sumByMonth('amount').forYear(2026).fillMissingData().trends();
    const fromOrm = await orm().sumByMonth('amount').forYear(2026).fillMissingData().trends();
    expect(fromExec).toEqual(fromOrm);
    // Jan=150, Feb=275, Mar=325, Apr=0, May=150, ...
    expect((fromExec as { data: number[] }).data.slice(0, 5)).toEqual([150, 275, 325, 0, 150]);
  });

  it('countByMonth trends match', async () => {
    const fromExec = await exec().countByMonth('id').forYear(2026).fillMissingData().trends();
    const fromOrm = await orm().countByMonth('id').forYear(2026).fillMissingData().trends();
    expect(fromExec).toEqual(fromOrm);
  });

  it('labelColumn groups by a categorical column, matching the TypeORM path', async () => {
    const fromExec = await exec()
      .sumByYear('amount', 1)
      .forYear(2026)
      .labelColumn('status')
      .trends();
    const fromOrm = await orm().sumByYear('amount', 1).forYear(2026).labelColumn('status').trends();
    expect(fromExec).toEqual(fromOrm);
    expect(fromExec).toEqual({ labels: ['paid', 'pending', 'refunded'], data: [750, 75, 75] });
  });

  it('rejects a non-UTC timezone on a SQLite executor', async () => {
    const builder = MetricsBuilder.queryExecutor(
      dataSource,
      { table: 'orders', dateColumn: 'created_at' },
      { timezone: 'America/Sao_Paulo' },
    );
    await expect(builder.sumByMonth('amount').forYear(2026).trends()).rejects.toBeInstanceOf(
      SqliteTimezoneUnsupportedException,
    );
  });
});
