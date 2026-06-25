import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DataSource } from 'typeorm';
import { Metrics } from '@pedropcardoso/metrics-core';
import {
  createOrdersDataSource,
  ordersQuery,
  seedOrders,
} from './helpers/orders-datasource';

describe('metrics() — count by month (tracer)', () => {
  let dataSource: DataSource;
  const year = new Date().getFullYear();

  beforeEach(async () => {
    dataSource = await createOrdersDataSource();
  });

  afterEach(async () => {
    await dataSource.destroy();
  });

  it('counts rows in the current year as a number', async () => {
    await seedOrders(dataSource, [
      { createdAt: `${year}-01-10 10:00:00` },
      { createdAt: `${year}-03-15 10:00:00` },
      { createdAt: `${year}-06-01 10:00:00` },
      { createdAt: `${year - 1}-12-01 10:00:00` },
    ]);

    const result = await Metrics.query(ordersQuery(dataSource))
      .count()
      .byMonth()
      .metrics();

    expect(result).toBe(3);
  });

  it('returns 0 (not null) when no rows match', async () => {
    const result = await Metrics.query(ordersQuery(dataSource))
      .count()
      .byMonth()
      .metrics();

    expect(result).toBe(0);
  });

  it('aggregates by the default id column with no argument', async () => {
    await seedOrders(dataSource, [
      { createdAt: `${year}-02-10 10:00:00` },
      { createdAt: `${year}-02-11 10:00:00` },
    ]);

    const result = await Metrics.query(ordersQuery(dataSource))
      .count()
      .byMonth()
      .metrics();

    expect(result).toBe(2);
    expect(typeof result).toBe('number');
  });
});
