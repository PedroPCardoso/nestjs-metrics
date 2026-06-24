import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DataSource as TypeOrmDataSource } from 'typeorm';
import { MetricsBuilder } from '../src/metrics.builder';
import { DataSource } from '../src/datasource';
import { WhereInput } from '../src/where';
import { createOrdersDataSource, resetOrders, seedOrders } from './helpers/orders-datasource';

/**
 * Structured `where` filters (equality / IN / range) scope the executor-mode
 * query without dropping to raw SQL. They AND with the period filters and bind
 * every value as a parameter.
 */
describe('executor mode structured where', () => {
  let typeorm: TypeOrmDataSource;
  let dataSource: DataSource;

  beforeAll(async () => {
    typeorm = await createOrdersDataSource('better-sqlite3');
    dataSource = { dialect: 'sqlite', execute: (sql, params) => typeorm.query(sql, params) };
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

  const exec = (where?: WhereInput) =>
    MetricsBuilder.queryExecutor(dataSource, { table: 'orders', dateColumn: 'created_at', where });

  it('filters by equality', async () => {
    expect(await exec({ status: 'paid' }).count().metrics()).toBe(4);
    expect(await exec({ status: 'paid' }).sum('amount').metrics()).toBe(750);
  });

  it('filters by IN (array)', async () => {
    expect(await exec({ status: ['paid', 'pending'] }).count().metrics()).toBe(6);
  });

  it('filters by range (gte/lte/gt/lt)', async () => {
    expect(await exec({ amount: { gte: 100 } }).count().metrics()).toBe(4);
    expect(await exec({ amount: { gt: 100, lte: 300 } }).count().metrics()).toBe(3);
  });

  it('filters by IS NULL', async () => {
    expect(await exec({ customer_id: null }).count().metrics()).toBe(7);
  });

  it('combines multiple conditions (AND)', async () => {
    expect(await exec({ status: 'paid', amount: { gte: 200 } }).count().metrics()).toBe(2);
  });

  it('ANDs with the period filter', async () => {
    const trends = await exec({ status: 'paid' })
      .sumByMonth('amount')
      .forYear(2026)
      .fillMissingData()
      .trends();
    // paid revenue per month: Jan=100, Feb=200, Mar=300, Apr=0, May=150
    expect((trends as { data: number[] }).data.slice(0, 5)).toEqual([100, 200, 300, 0, 150]);
  });

  it('rejects an unsafe column name in a where key', () => {
    expect(() => exec({ 'status; DROP TABLE orders': 'x' })).toThrow();
  });
});
