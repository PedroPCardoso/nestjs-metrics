import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DataSource } from 'typeorm';
import { Metrics } from 'nestjs-metrics-core';
import {
  allTestDrivers,
  createOrdersDataSource,
  ordersJoinCustomers,
  ordersQuery,
  resetOrders,
  seedCustomers,
  seedOrders,
  TestDriver,
} from './helpers/orders-datasource';

describe.each(allTestDrivers())('ranges & targeting on %s', (driver: TestDriver) => {
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

  describe('between / from', () => {
    it('between() buckets by day and excludes out-of-range rows', async () => {
      await seedOrders(dataSource, [
        { createdAt: '2026-01-10 10:00:00' },
        { createdAt: '2026-01-10 12:00:00' },
        { createdAt: '2026-01-12 10:00:00' },
        { createdAt: '2026-02-01 10:00:00' }, // out of range
      ]);

      const r = await m().count().between('2026-01-01', '2026-01-31').trends();
      expect(r.labels).toEqual(['2026-01-10', '2026-01-12']);
      expect(r.data).toEqual([2, 1]);
    });

    it('from() covers [date .. today]', async () => {
      await seedOrders(dataSource, [
        { createdAt: '2026-01-10 10:00:00' }, // before
        { createdAt: '2026-01-12 10:00:00' }, // after
      ]);

      expect(await m().count().from('2026-01-11').metrics()).toBe(1);
    });

    it('rejects malformed dates', async () => {
      expect(() => m().count().between('2026/01/01', '2026-01-31')).toThrow(/invalid date/);
    });
  });

  describe('granularity', () => {
    beforeEach(async () => {
      await seedOrders(dataSource, [
        { createdAt: '2026-01-10 10:00:00' },
        { createdAt: '2026-01-20 10:00:00' },
        { createdAt: '2026-02-15 10:00:00' },
        { createdAt: '2026-03-01 10:00:00' },
      ]);
    });

    it('groupByMonth buckets the range by month', async () => {
      const r = await m().count().between('2026-01-01', '2026-03-31').groupByMonth().trends();
      expect(r.labels).toEqual(['2026-01', '2026-02', '2026-03']);
      expect(r.data).toEqual([2, 1, 1]);
    });

    it('groupByYear buckets the range by year', async () => {
      const r = await m().count().between('2026-01-01', '2026-12-31').groupByYear().trends();
      expect(r.labels).toEqual(['2026']);
      expect(r.data).toEqual([4]);
    });

    it('groupByDay buckets the range by day (explicit)', async () => {
      const r = await m().count().between('2026-01-01', '2026-01-31').groupByDay().trends();
      expect(r.labels).toEqual(['2026-01-10', '2026-01-20']);
      expect(r.data).toEqual([1, 1]);
    });

    it('groupByWeek buckets the range by ISO week', async () => {
      await resetOrders(dataSource);
      await seedOrders(dataSource, [
        { createdAt: '2026-03-02 10:00:00' }, // ISO week 10
        { createdAt: '2026-03-09 10:00:00' }, // ISO week 11
      ]);

      const r = await m().count().between('2026-03-01', '2026-03-15').groupByWeek().trends();
      expect(r.labels).toEqual(['2026-W10', '2026-W11']);
      expect(r.data).toEqual([1, 1]);
    });
  });

  describe('range shorthands', () => {
    beforeEach(async () => {
      await seedOrders(dataSource, [
        { createdAt: '2026-06-01 10:00:00', amount: 100 },
        { createdAt: '2026-06-02 10:00:00', amount: 200 },
      ]);
    });

    it('sumBetween delegates to sum().between()', async () => {
      expect(await m().sumBetween(['2026-01-01', '2026-12-31'], 'amount').metrics()).toBe(
        await m().sum('amount').between('2026-01-01', '2026-12-31').metrics(),
      );
      expect(await m().sumBetween(['2026-01-01', '2026-12-31'], 'amount').metrics()).toBe(300);
    });

    it('countFrom delegates to count().from()', async () => {
      expect(await m().countFrom('2020-01-01').metrics()).toBe(2);
    });

    it('averageBetween / maxFrom delegate to the core', async () => {
      expect(await m().averageBetween(['2026-01-01', '2026-12-31'], 'amount').metrics()).toBe(150);
      expect(await m().maxFrom('2020-01-01', 'amount').metrics()).toBe(200);
    });
  });

  describe('targeting', () => {
    it('dateColumn buckets by a different date column', async () => {
      await seedOrders(dataSource, [
        { createdAt: '2026-01-10 10:00:00', updatedAt: '2026-03-10 10:00:00' },
      ]);

      const byUpdated = await m()
        .count()
        .dateColumn('updated_at')
        .byMonth()
        .forYear(2026)
        .trends();
      expect(byUpdated.labels).toEqual(['March']);

      const byCreated = await m().count().byMonth().forYear(2026).trends();
      expect(byCreated.labels).toEqual(['January']);
    });

    it('labelColumn groups by a categorical column', async () => {
      await seedOrders(dataSource, [
        { createdAt: '2026-01-10 10:00:00', status: 'pending' },
        { createdAt: '2026-01-11 10:00:00', status: 'pending' },
        { createdAt: '2026-01-12 10:00:00', status: 'delivered' },
      ]);

      const r = await m().count().labelColumn('status').trends();
      expect(r.labels).toEqual(['delivered', 'pending']);
      expect(r.data).toEqual([1, 2]);
    });

    it('table() runs metrics over a joined table', async () => {
      await seedCustomers(dataSource, [
        { id: 1, name: 'Acme' },
        { id: 2, name: 'Globex' },
      ]);
      await seedOrders(dataSource, [
        { createdAt: '2026-01-10 10:00:00', customerId: 1 },
        { createdAt: '2026-01-11 10:00:00', customerId: 1 },
        { createdAt: '2026-01-12 10:00:00', customerId: 2 },
      ]);

      const r = await Metrics.query(ordersJoinCustomers(dataSource))
        .count()
        .table('customers')
        .labelColumn('name')
        .trends();
      expect(r.labels).toEqual(['Acme', 'Globex']);
      expect(r.data).toEqual([2, 1]);
    });
  });
});
