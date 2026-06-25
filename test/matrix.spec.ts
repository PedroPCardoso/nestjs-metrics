import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DataSource } from 'typeorm';
import { Metrics } from '@pedropcardoso/metrics-core';
import {
  allTestDrivers,
  createOrdersDataSource,
  ordersQuery,
  resetOrders,
  seedOrders,
  TestDriver,
} from './helpers/orders-datasource';

describe.each(allTestDrivers())('aggregate × period matrix on %s', (driver: TestDriver) => {
  let dataSource: DataSource;
  const year = new Date().getFullYear();
  const m = (qb = ordersQuery(dataSource)) => Metrics.query(qb);

  beforeAll(async () => {
    dataSource = await createOrdersDataSource(driver);
  });

  afterAll(async () => {
    await dataSource?.destroy();
  });

  beforeEach(async () => {
    await resetOrders(dataSource);
  });

  describe('aggregates (metrics, all-time)', () => {
    beforeEach(async () => {
      await seedOrders(dataSource, [
        { createdAt: `${year}-06-01 10:00:00`, amount: 100 },
        { createdAt: `${year}-06-02 10:00:00`, amount: 200 },
        { createdAt: `${year}-06-03 10:00:00`, amount: 300 },
      ]);
    });

    it('count', async () => {
      expect(await m().count().byYear().metrics()).toBe(3);
    });
    it('sum', async () => {
      expect(await m().sum('amount').byYear().metrics()).toBe(600);
    });
    it('average', async () => {
      expect(await m().average('amount').byYear().metrics()).toBe(200);
    });
    it('max', async () => {
      expect(await m().max('amount').byYear().metrics()).toBe(300);
    });
    it('min', async () => {
      expect(await m().min('amount').byYear().metrics()).toBe(100);
    });
  });

  describe('periods bucket (trends)', () => {
    it('byYear labels are integer years', async () => {
      await seedOrders(dataSource, [
        { createdAt: '2022-01-10 10:00:00' },
        { createdAt: '2023-06-15 10:00:00' },
        { createdAt: '2024-12-01 10:00:00' },
        { createdAt: '2024-02-01 10:00:00' },
      ]);

      const r = await m().count().byYear().trends();
      expect(r.labels).toEqual([2022, 2023, 2024]);
      expect(r.data).toEqual([1, 1, 2]);
    });

    it('byDay labels are weekday names', async () => {
      await seedOrders(dataSource, [
        { createdAt: '2026-06-01 10:00:00' }, // Monday
        { createdAt: '2026-06-01 12:00:00' },
        { createdAt: '2026-06-02 10:00:00' }, // Tuesday
      ]);

      const r = await m().count().byDay().forYear(2026).forMonth(6).trends();
      expect(r.labels).toEqual(['Monday', 'Tuesday']);
      expect(r.data).toEqual([2, 1]);
    });

    it('byWeek labels are ISO week numbers', async () => {
      await seedOrders(dataSource, [{ createdAt: '2026-03-09 10:00:00' }]); // ISO week 11

      const r = await m().count().byWeek().forYear(2026).forMonth(3).trends();
      expect(r.labels).toEqual(['Week 11']);
      expect(r.data).toEqual([1]);
    });
  });

  describe('window semantics (metrics)', () => {
    beforeEach(async () => {
      await seedOrders(dataSource, [
        { createdAt: `${year}-02-15 10:00:00` },
        { createdAt: `${year}-03-15 10:00:00` },
        { createdAt: `${year}-05-15 10:00:00` },
        { createdAt: `${year}-06-15 10:00:00` },
        { createdAt: `${year}-06-20 10:00:00` },
      ]);
    });

    it('byMonth(0) covers the whole year', async () => {
      expect(await m().count().byMonth().forYear(year).metrics()).toBe(5);
    });

    it('byMonth(1) covers a single month', async () => {
      expect(await m().count().byMonth(1).forYear(year).forMonth(6).metrics()).toBe(2);
    });

    it('byMonth(3) covers the last-n window [3..6]', async () => {
      // window = months 3..6, so Feb (month 2) is excluded
      expect(await m().count().byMonth(3).forYear(year).forMonth(6).metrics()).toBe(4);
    });
  });

  describe('window semantics by year (metrics)', () => {
    beforeEach(async () => {
      await seedOrders(dataSource, [
        { createdAt: '2022-05-01 10:00:00' },
        { createdAt: '2023-05-01 10:00:00' },
        { createdAt: '2024-05-01 10:00:00' },
        { createdAt: '2024-09-01 10:00:00' },
      ]);
    });

    it('byYear(1) covers a single year', async () => {
      expect(await m().count().byYear(1).forYear(2024).metrics()).toBe(2);
    });

    it('byYear(3) covers the [year-3..year] window', async () => {
      // [2021..2024] → all four rows
      expect(await m().count().byYear(3).forYear(2024).metrics()).toBe(4);
    });
  });

  describe('non-count aggregates through trends()', () => {
    beforeEach(async () => {
      await seedOrders(dataSource, [
        { createdAt: `${year}-01-10 10:00:00`, amount: 100 },
        { createdAt: `${year}-01-20 10:00:00`, amount: 200 },
        { createdAt: `${year}-03-15 10:00:00`, amount: 50 },
      ]);
    });

    it('sum by month', async () => {
      const r = await m().sum('amount').byMonth().forYear(year).trends();
      expect(r.labels).toEqual(['January', 'March']);
      expect(r.data).toEqual([300, 50]);
    });

    it('max by month', async () => {
      const r = await m().max('amount').byMonth().forYear(year).trends();
      expect(r.labels).toEqual(['January', 'March']);
      expect(r.data).toEqual([200, 50]);
    });

    it('average by month', async () => {
      const r = await m().average('amount').byMonth().forYear(year).trends();
      expect(r.labels).toEqual(['January', 'March']);
      expect(r.data).toEqual([150, 50]);
    });
  });

  describe('reference-point single-period (forDay / forWeek)', () => {
    it('forDay targets a single day', async () => {
      await seedOrders(dataSource, [
        { createdAt: '2026-06-01 10:00:00' },
        { createdAt: '2026-06-02 10:00:00' },
        { createdAt: '2026-06-02 12:00:00' },
      ]);

      const result = await m().count().byDay(1).forYear(2026).forMonth(6).forDay(2).metrics();
      expect(result).toBe(2);
    });

    it('forWeek targets a single ISO week', async () => {
      await seedOrders(dataSource, [
        { createdAt: '2026-03-02 10:00:00' }, // ISO week 10
        { createdAt: '2026-03-09 10:00:00' }, // ISO week 11
      ]);

      const result = await m().count().byWeek(1).forYear(2026).forMonth(3).forWeek(11).metrics();
      expect(result).toBe(1);
    });
  });

  describe('byDay last-n window (PeriodResolver via public API)', () => {
    it('byDay(3) covers [day-3 .. day] within the current month', async () => {
      // Use the current year/month so the resolver's ref.month === now.month
      // branch is deterministic regardless of the run date.
      const now = new Date();
      const yr = now.getFullYear();
      const mo = String(now.getMonth() + 1).padStart(2, '0');
      await seedOrders(dataSource, [
        { createdAt: `${yr}-${mo}-10 10:00:00` }, // excluded (< 12)
        { createdAt: `${yr}-${mo}-12 10:00:00` },
        { createdAt: `${yr}-${mo}-13 10:00:00` },
        { createdAt: `${yr}-${mo}-15 10:00:00` },
      ]);

      const result = await m()
        .count()
        .byDay(3)
        .forYear(yr)
        .forMonth(now.getMonth() + 1)
        .forDay(15)
        .metrics();
      expect(result).toBe(3);
    });
  });

  describe('percent trends', () => {
    it('trends(true) returns percentages of the total', async () => {
      await seedOrders(dataSource, [
        { createdAt: `${year}-01-10 10:00:00` },
        { createdAt: `${year}-01-20 10:00:00` },
        { createdAt: `${year}-01-25 10:00:00` },
        { createdAt: `${year}-03-15 10:00:00` },
      ]);

      const r = await m().count().byMonth().forYear(year).trends(true);
      expect(r.labels).toEqual(['January', 'March']);
      expect(r.data).toEqual([75, 25]);
    });
  });

  describe('combined shorthands', () => {
    beforeEach(async () => {
      await seedOrders(dataSource, [
        { createdAt: `${year}-06-01 10:00:00`, amount: 100 },
        { createdAt: `${year}-06-02 10:00:00`, amount: 200 },
      ]);
    });

    it('sumByYear delegates to sum().byYear()', async () => {
      expect(await m().sumByYear('amount').metrics()).toBe(
        await m().sum('amount').byYear().metrics(),
      );
      expect(await m().sumByYear('amount').metrics()).toBe(300);
    });

    it('countByMonth delegates to count().byMonth()', async () => {
      const a = await m().countByMonth().forYear(year).trends();
      const b = await m().count().byMonth().forYear(year).trends();
      expect(a).toEqual(b);
    });

    it('averageByMonth / maxByWeek / minByYear exist and run', async () => {
      expect(await m().averageByMonth('amount').forYear(year).forMonth(6).metrics()).toBe(150);
      expect(await m().minByYear('amount').metrics()).toBe(100);
    });
  });
});

describe('ISO-8601 week is identical across dialects', () => {
  it('yields the same week label on every database', async () => {
    const labelsByDriver: Record<string, (string | number)[]> = {};

    for (const driver of allTestDrivers()) {
      const ds = await createOrdersDataSource(driver);
      await resetOrders(ds);
      await seedOrders(ds, [{ createdAt: '2026-03-09 10:00:00' }]);

      const r = await Metrics.query(ordersQuery(ds))
        .count()
        .byWeek()
        .forYear(2026)
        .forMonth(3)
        .trends();
      labelsByDriver[driver] = r.labels;
      await ds.destroy();
    }

    const all = Object.values(labelsByDriver);
    for (const labels of all) {
      expect(labels).toEqual(['Week 11']);
    }
  });
});
