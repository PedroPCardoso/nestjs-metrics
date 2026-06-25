import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DataSource } from 'typeorm';
import {
  InvalidPeriodException,
  InvalidVariationsCountException,
  Metrics,
  Period,
} from 'nestjs-metrics-core';
import {
  allTestDrivers,
  createOrdersDataSource,
  ordersQuery,
  resetOrders,
  seedOrders,
  TestDriver,
} from './helpers/orders-datasource';

const year = new Date().getFullYear();

function rows(thisYear: number, lastYear: number) {
  return [
    ...Array.from({ length: thisYear }, (_, i) => ({ createdAt: `${year}-06-${10 + i} 10:00:00` })),
    ...Array.from({ length: lastYear }, (_, i) => ({
      createdAt: `${year - 1}-06-${10 + i} 10:00:00`,
    })),
  ];
}

describe.each(allTestDrivers())('metricsWithVariations on %s', (driver: TestDriver) => {
  let dataSource: DataSource;
  const current = () => Metrics.query(ordersQuery(dataSource)).count().byYear(1).forYear(year);

  beforeAll(async () => {
    dataSource = await createOrdersDataSource(driver);
  });

  afterAll(async () => {
    await dataSource?.destroy();
  });

  beforeEach(async () => {
    await resetOrders(dataSource);
  });

  it('reports an increase vs the prior year', async () => {
    await seedOrders(dataSource, rows(5, 2));
    const r = await current().metricsWithVariations(1, Period.YEAR);
    expect(r).toEqual({ count: 5, variation: { type: 'increase', value: 3 } });
  });

  it('reports a decrease vs the prior year', async () => {
    await seedOrders(dataSource, rows(2, 5));
    const r = await current().metricsWithVariations(1, Period.YEAR);
    expect(r).toEqual({ count: 2, variation: { type: 'decrease', value: 3 } });
  });

  it('reports no change when equal', async () => {
    await seedOrders(dataSource, rows(3, 3));
    const r = await current().metricsWithVariations(1, Period.YEAR);
    expect(r).toEqual({ count: 3, variation: { type: 'none', value: 0 } });
  });

  it('expresses an increase as a percentage', async () => {
    await seedOrders(dataSource, rows(6, 4));
    const r = await current().metricsWithVariations(1, Period.YEAR, true);
    expect(r).toEqual({ count: 6, variation: { type: 'increase', value: '50%' } });
  });

  it('expresses a decrease as a percentage and keeps the sign', async () => {
    await seedOrders(dataSource, rows(3, 6));
    const r = await current().metricsWithVariations(1, Period.YEAR, true);
    expect(r).toEqual({ count: 3, variation: { type: 'decrease', value: '50%' } });
  });

  it('does not mutate the current builder', async () => {
    await seedOrders(dataSource, rows(5, 2));
    const builder = current();
    const before = await builder.metrics();
    await builder.metricsWithVariations(1, Period.YEAR);
    const after = await builder.metrics();
    expect(after).toBe(before);
    expect(after).toBe(5);
  });
});

describe('metricsWithVariations validation', () => {
  let dataSource: DataSource;

  beforeAll(async () => {
    dataSource = await createOrdersDataSource();
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  it('rejects a non-positive variations count', async () => {
    await expect(
      Metrics.query(ordersQuery(dataSource)).count().byYear(1).metricsWithVariations(0, Period.YEAR),
    ).rejects.toThrow(InvalidVariationsCountException);
  });

  it('rejects an unsupported previous period', async () => {
    await expect(
      Metrics.query(ordersQuery(dataSource))
        .count()
        .byYear(1)
        .metricsWithVariations(1, Period.TODAY),
    ).rejects.toThrow(InvalidPeriodException);
  });
});
