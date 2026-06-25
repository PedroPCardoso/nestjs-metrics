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

describe.each(allTestDrivers())('trends() count by month on %s', (driver: TestDriver) => {
  let dataSource: DataSource;
  const year = new Date().getFullYear();

  beforeAll(async () => {
    dataSource = await createOrdersDataSource(driver);
  });

  afterAll(async () => {
    await dataSource?.destroy();
  });

  beforeEach(async () => {
    await resetOrders(dataSource);
  });

  it('returns month-name labels and per-month counts', async () => {
    await seedOrders(dataSource, [
      { createdAt: `${year}-01-10 10:00:00` },
      { createdAt: `${year}-01-20 10:00:00` },
      { createdAt: `${year}-03-15 10:00:00` },
    ]);

    const result = await Metrics.query(ordersQuery(dataSource))
      .count()
      .byMonth()
      .trends();

    expect(result.labels).toContain('January');
    expect(result.labels).toContain('March');
    expect(result.labels).not.toContain('February');

    const data = result.data as number[];
    const jan = result.labels.indexOf('January');
    const mar = result.labels.indexOf('March');
    expect(data[jan]).toBe(2);
    expect(data[mar]).toBe(1);
  });

  it('returns empty labels and data when no rows match', async () => {
    const result = await Metrics.query(ordersQuery(dataSource))
      .count()
      .byMonth()
      .trends();

    expect(result).toEqual({ labels: [], data: [] });
  });
});

describe('trends() label locale (SQLite)', () => {
  let dataSource: DataSource;
  const year = new Date().getFullYear();

  beforeAll(async () => {
    dataSource = await createOrdersDataSource();
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  beforeEach(async () => {
    await resetOrders(dataSource);
    await seedOrders(dataSource, [
      { createdAt: `${year}-01-10 10:00:00` },
      { createdAt: `${year}-02-10 10:00:00` },
    ]);
  });

  it('translates month labels in en (default)', async () => {
    const result = await Metrics.query(ordersQuery(dataSource))
      .count()
      .byMonth()
      .trends();

    expect(result.labels).toEqual(['January', 'February']);
  });

  it('translates month labels in pt-BR', async () => {
    const result = await Metrics.query(ordersQuery(dataSource), { locale: 'pt-BR' })
      .count()
      .byMonth()
      .trends();

    expect(result.labels).toEqual(['janeiro', 'fevereiro']);
  });
});
