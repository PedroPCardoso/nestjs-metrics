import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DataSource } from 'typeorm';
import { Metrics } from '../src/index';
import {
  allTestDrivers,
  createOrdersDataSource,
  ordersQuery,
  resetOrders,
  seedOrders,
  TestDriver,
} from './helpers/orders-datasource';

describe.each(allTestDrivers())('fillMissingData on %s', (driver: TestDriver) => {
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

  describe('date periods (gap fill between min and max present)', () => {
    it('byMonth fills empty months with 0', async () => {
      await seedOrders(dataSource, [
        { createdAt: '2026-01-10 10:00:00' },
        { createdAt: '2026-03-15 10:00:00' },
      ]);

      const r = await m().count().byMonth().forYear(2026).fillMissingData().trends();
      expect(r.labels).toEqual(['January', 'February', 'March']);
      expect(r.data).toEqual([1, 0, 1]);
    });

    it('byYear fills empty years with 0', async () => {
      await seedOrders(dataSource, [
        { createdAt: '2022-05-01 10:00:00' },
        { createdAt: '2024-05-01 10:00:00' },
      ]);

      const r = await m().count().byYear().fillMissingData().trends();
      expect(r.labels).toEqual([2022, 2023, 2024]);
      expect(r.data).toEqual([1, 0, 1]);
    });

    it('byDay fills empty days within a week with 0', async () => {
      await seedOrders(dataSource, [
        { createdAt: '2026-06-01 10:00:00' }, // Monday
        { createdAt: '2026-06-03 10:00:00' }, // Wednesday
      ]);

      const r = await m().count().byDay().forYear(2026).forMonth(6).fillMissingData().trends();
      expect(r.labels).toEqual(['Monday', 'Tuesday', 'Wednesday']);
      expect(r.data).toEqual([1, 0, 1]);
    });

    it('byWeek fills empty ISO weeks with 0', async () => {
      await seedOrders(dataSource, [
        { createdAt: '2026-03-02 10:00:00' }, // week 10
        { createdAt: '2026-03-16 10:00:00' }, // week 12
      ]);

      const r = await m().count().byWeek().forYear(2026).forMonth(3).fillMissingData().trends();
      expect(r.labels).toEqual(['Week 10', 'Week 11', 'Week 12']);
      expect(r.data).toEqual([1, 0, 1]);
    });

    it('honours a custom default value', async () => {
      await seedOrders(dataSource, [
        { createdAt: '2026-01-10 10:00:00' },
        { createdAt: '2026-03-15 10:00:00' },
      ]);

      const r = await m().count().byMonth().forYear(2026).fillMissingData(99).trends();
      expect(r.data).toEqual([1, 99, 1]);
    });

    it('combines with percentage output', async () => {
      await seedOrders(dataSource, [
        { createdAt: '2026-01-10 10:00:00' },
        { createdAt: '2026-01-20 10:00:00' },
        { createdAt: '2026-01-25 10:00:00' },
        { createdAt: '2026-03-15 10:00:00' },
      ]);

      const r = await m().count().byMonth().forYear(2026).fillMissingData().trends(true);
      expect(r.labels).toEqual(['January', 'February', 'March']);
      expect(r.data).toEqual([75, 0, 25]);
    });
  });

  describe('between ranges (full range enumerated)', () => {
    it('fills empty buckets across the whole range', async () => {
      await seedOrders(dataSource, [
        { createdAt: '2026-01-10 10:00:00' },
        { createdAt: '2026-03-15 10:00:00' },
      ]);

      const r = await m()
        .count()
        .between('2026-01-01', '2026-04-30')
        .groupByMonth()
        .fillMissingData()
        .trends();
      expect(r.labels).toEqual(['2026-01', '2026-02', '2026-03', '2026-04']);
      expect(r.data).toEqual([1, 0, 1, 0]);
    });
  });

  describe('categorical series (labelColumn)', () => {
    it('auto-discovers distinct labels and fills the absent ones', async () => {
      await seedOrders(dataSource, [
        { createdAt: '2025-05-01 10:00:00', status: 'cancelled' },
        { createdAt: '2026-05-01 10:00:00', status: 'pending' },
        { createdAt: '2026-05-02 10:00:00', status: 'pending' },
        { createdAt: '2026-05-03 10:00:00', status: 'delivered' },
      ]);

      // Trend is scoped to 2026 (no cancelled), but the label axis is the full
      // distinct set, so cancelled is filled with 0.
      const r = await m()
        .count()
        .labelColumn('status')
        .byYear(1)
        .forYear(2026)
        .fillMissingData()
        .trends();
      expect(r.labels).toEqual(['cancelled', 'delivered', 'pending']);
      expect(r.data).toEqual([0, 1, 2]);
    });

    it('honours an explicit label set', async () => {
      await seedOrders(dataSource, [
        { createdAt: '2026-01-10 10:00:00', status: 'pending' },
        { createdAt: '2026-01-11 10:00:00', status: 'pending' },
        { createdAt: '2026-01-12 10:00:00', status: 'delivered' },
      ]);

      const r = await m()
        .count()
        .labelColumn('status')
        .fillMissingData(0, ['pending', 'delivered', 'cancelled'])
        .trends();
      expect(r.labels).toEqual(['pending', 'delivered', 'cancelled']);
      expect(r.data).toEqual([2, 1, 0]);
    });
  });
});
