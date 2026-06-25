import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DataSource } from 'typeorm';
import { InvalidTimezoneException, Metrics, TrendsResult } from '@pedropcardoso/metrics-core';
import {
  allTestDrivers,
  createOrdersDataSource,
  ordersQuery,
  resetOrders,
  seedOrders,
  TestDriver,
} from './helpers/orders-datasource';

const NY = 'America/New_York';

describe.each(allTestDrivers())('timezone bucketing on %s', (driver: TestDriver) => {
  let dataSource: DataSource;

  beforeAll(async () => {
    dataSource = await createOrdersDataSource(driver);
  });

  afterAll(async () => {
    await dataSource?.destroy();
  });

  beforeEach(async () => {
    await resetOrders(dataSource);
  });

  it('defaults to UTC (no shift)', async () => {
    // 03:30 UTC is still July 15 in UTC.
    await seedOrders(dataSource, [{ createdAt: '2026-07-15 03:30:00' }]);
    const onThe15th = await Metrics.query(ordersQuery(dataSource))
      .count()
      .between('2026-07-15', '2026-07-15')
      .metrics();
    expect(onThe15th).toBe(1);
  });

  it('shifts a near-midnight row to the correct local day', async () => {
    // 03:30 UTC = 23:30 (Jul 14) in New York.
    await seedOrders(dataSource, [{ createdAt: '2026-07-15 03:30:00' }]);
    const q = () => Metrics.query(ordersQuery(dataSource), { timezone: NY });

    expect(await q().count().between('2026-07-14', '2026-07-14').metrics()).toBe(1);
    expect(await q().count().between('2026-07-15', '2026-07-15').metrics()).toBe(0);
  });

  it('applies the DST offset (EDT, -4) for a July date', async () => {
    // 04:30 UTC = 00:30 (Jul 15) in EDT; a fixed -5 (EST) would land on Jul 14.
    await seedOrders(dataSource, [{ createdAt: '2026-07-15 04:30:00' }]);
    const onThe15th = await Metrics.query(ordersQuery(dataSource), { timezone: NY })
      .count()
      .between('2026-07-15', '2026-07-15')
      .metrics();
    expect(onThe15th).toBe(1);
  });

  it('buckets trends labels in local time', async () => {
    await seedOrders(dataSource, [{ createdAt: '2026-07-15 03:30:00' }]);
    const r = (await Metrics.query(ordersQuery(dataSource), { timezone: NY })
      .count()
      .between('2026-07-13', '2026-07-16')
      .groupByDay()
      .trends()) as TrendsResult;
    expect(r.labels).toEqual(['2026-07-14']);
    expect(r.data).toEqual([1]);
  });
});

describe('timezone is DST-correct and identical across dialects', () => {
  it('buckets the same near-midnight row to the same local day everywhere', async () => {
    const results: Record<string, number> = {};

    for (const driver of allTestDrivers()) {
      const ds = await createOrdersDataSource(driver);
      await resetOrders(ds);
      await seedOrders(ds, [{ createdAt: '2026-07-15 03:30:00' }]);
      results[driver] = await Metrics.query(ordersQuery(ds), { timezone: NY })
        .count()
        .between('2026-07-14', '2026-07-14')
        .metrics();
      await ds.destroy();
    }

    // SQLite (Luxon oracle), Postgres and MySQL all agree: local day is Jul 14.
    for (const value of Object.values(results)) {
      expect(value).toBe(1);
    }
  });
});

describe('timezone validation', () => {
  let dataSource: DataSource;

  beforeAll(async () => {
    dataSource = await createOrdersDataSource();
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  it('rejects an invalid IANA timezone', () => {
    expect(() => Metrics.query(ordersQuery(dataSource), { timezone: 'Not/AZone' })).toThrow(
      InvalidTimezoneException,
    );
  });
});
