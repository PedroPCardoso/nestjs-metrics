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

/**
 * The tracer query executed against every available database. SQLite always
 * runs; Postgres and MySQL run when their connection env vars are present
 * (docker compose / CI), which is the blocking multi-dialect gate.
 */
describe.each(allTestDrivers())('count().byMonth().metrics() on %s', (driver: TestDriver) => {
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

  it('returns 0 when no rows match', async () => {
    const result = await Metrics.query(ordersQuery(dataSource))
      .count()
      .byMonth()
      .metrics();

    expect(result).toBe(0);
  });
});
