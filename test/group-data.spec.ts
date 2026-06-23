import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DataSource } from 'typeorm';
import { GroupedTrendsResult, Metrics } from '../src/index';
import {
  allTestDrivers,
  createOrdersDataSource,
  ordersQuery,
  resetOrders,
  seedOrders,
  TestDriver,
} from './helpers/orders-datasource';

describe.each(allTestDrivers())('groupData on %s', (driver: TestDriver) => {
  let dataSource: DataSource;
  const m = () => Metrics.query(ordersQuery(dataSource));

  beforeAll(async () => {
    dataSource = await createOrdersDataSource(driver);
  });

  afterAll(async () => {
    await dataSource?.destroy();
  });

  beforeEach(async () => {
    await resetOrders(dataSource);
  });

  it('splits a column into one series per value plus a total', async () => {
    await seedOrders(dataSource, [
      { createdAt: '2026-01-10 10:00:00', status: 'pending' },
      { createdAt: '2026-01-11 10:00:00', status: 'pending' },
      { createdAt: '2026-01-12 10:00:00', status: 'delivered' },
      { createdAt: '2026-03-10 10:00:00', status: 'pending' },
      { createdAt: '2026-03-11 10:00:00', status: 'cancelled' },
    ]);

    const r = (await m()
      .countByMonth('status')
      .groupData(['pending', 'delivered', 'cancelled'])
      .forYear(2026)
      .trends()) as GroupedTrendsResult;

    expect(r.labels).toEqual(['January', 'March']);
    expect(r.data.total).toEqual([3, 2]);
    expect(r.data.pending).toEqual([2, 1]);
    expect(r.data.delivered).toEqual([1, 0]);
    expect(r.data.cancelled).toEqual([0, 1]);
  });

  it('respects fillMissingData across every series', async () => {
    await seedOrders(dataSource, [
      { createdAt: '2026-01-10 10:00:00', status: 'pending' },
      { createdAt: '2026-01-11 10:00:00', status: 'delivered' },
      { createdAt: '2026-03-10 10:00:00', status: 'pending' },
    ]);

    const r = (await m()
      .countByMonth('status')
      .groupData(['pending', 'delivered'])
      .forYear(2026)
      .fillMissingData()
      .trends()) as GroupedTrendsResult;

    expect(r.labels).toEqual(['January', 'February', 'March']);
    expect(r.data.total).toEqual([2, 0, 1]);
    expect(r.data.pending).toEqual([1, 0, 1]);
    expect(r.data.delivered).toEqual([1, 0, 0]);
  });

  it('binds group values as parameters (no SQL injection via the value)', async () => {
    await seedOrders(dataSource, [
      { createdAt: '2026-01-10 10:00:00', status: "x'y" },
      { createdAt: '2026-01-11 10:00:00', status: "x'y" },
      { createdAt: '2026-01-12 10:00:00', status: 'other' },
    ]);

    const r = (await m()
      .countByMonth('status')
      .groupData(["x'y"])
      .forYear(2026)
      .trends()) as GroupedTrendsResult;

    expect(r.labels).toEqual(['January']);
    expect(r.data.total).toEqual([3]);
    expect(r.data["x'y"]).toEqual([2]);
  });
});
