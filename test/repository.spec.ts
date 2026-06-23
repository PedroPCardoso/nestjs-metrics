import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DataSource } from 'typeorm';
import { Metrics, metricsFor, withMetrics } from '../src/index';
import {
  Order,
  createOrdersDataSource,
  ordersQuery,
  resetOrders,
  seedOrders,
} from './helpers/orders-datasource';

describe('repository entry points', () => {
  let dataSource: DataSource;

  beforeAll(async () => {
    dataSource = await createOrdersDataSource();
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  beforeEach(async () => {
    await resetOrders(dataSource);
    await seedOrders(dataSource, [
      { createdAt: '2026-01-10 10:00:00', amount: 100 },
      { createdAt: '2026-03-15 10:00:00', amount: 200 },
    ]);
  });

  it('metricsFor(repo) matches Metrics.query', async () => {
    const repo = dataSource.getRepository(Order);
    const viaQuery = await Metrics.query(ordersQuery(dataSource))
      .sum('amount')
      .byMonth()
      .forYear(2026)
      .trends();
    const viaRepo = await metricsFor(repo).sum('amount').byMonth().forYear(2026).trends();

    expect(viaRepo).toEqual(viaQuery);
  });

  it('withMetrics(repo).metrics() matches Metrics.query', async () => {
    const repo = withMetrics(dataSource.getRepository(Order));
    const viaQuery = await Metrics.query(ordersQuery(dataSource))
      .count()
      .byMonth()
      .forYear(2026)
      .trends();
    const viaExtension = await repo.metrics().count().byMonth().forYear(2026).trends();

    expect(viaExtension).toEqual(viaQuery);
  });

  it('passes options through metricsFor', async () => {
    const repo = dataSource.getRepository(Order);
    const r = await metricsFor(repo, { locale: 'pt-BR' })
      .count()
      .byMonth()
      .forYear(2026)
      .trends();
    expect(r.labels).toEqual(['janeiro', 'março']);
  });
});
