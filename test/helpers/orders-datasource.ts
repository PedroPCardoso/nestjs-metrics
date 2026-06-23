import 'reflect-metadata';
import {
  DataSource,
  DataSourceOptions,
  EntitySchema,
  SelectQueryBuilder,
} from 'typeorm';

/**
 * The `orders` fixture mirrors the table used by the original laravel-metrics
 * test suite: id, status, amount, created_at, updated_at.
 */
export interface OrderRow {
  id: number;
  status: string;
  amount: number;
  created_at: string;
  updated_at: string;
}

export const Order = new EntitySchema<OrderRow>({
  name: 'Order',
  tableName: 'orders',
  columns: {
    id: { type: Number, primary: true, generated: true },
    status: { type: String, default: 'pending' },
    amount: { type: 'decimal', precision: 10, scale: 2, default: 0 },
    // `Date` lets TypeORM pick the dialect-appropriate timestamp column type.
    created_at: { type: Date, nullable: true },
    updated_at: { type: Date, nullable: true },
  },
});

export type TestDriver = 'better-sqlite3' | 'postgres' | 'mysql';

export interface SeedOrder {
  createdAt: string;
  status?: string;
  amount?: number;
}

/**
 * External database drivers are exercised only when their connection env vars
 * are present (set by docker compose / CI). Locally, only SQLite runs.
 */
export function availableExternalDrivers(): TestDriver[] {
  const drivers: TestDriver[] = [];
  if (process.env.PG_HOST) drivers.push('postgres');
  if (process.env.MYSQL_HOST) drivers.push('mysql');
  return drivers;
}

export function allTestDrivers(): TestDriver[] {
  return ['better-sqlite3', ...availableExternalDrivers()];
}

function optionsFor(driver: TestDriver): DataSourceOptions {
  const base = { entities: [Order], synchronize: true };

  switch (driver) {
    case 'postgres':
      return {
        ...base,
        type: 'postgres',
        host: process.env.PG_HOST,
        port: Number(process.env.PG_PORT ?? 5432),
        username: process.env.PG_USER ?? 'metrics',
        password: process.env.PG_PASSWORD ?? 'metrics',
        database: process.env.PG_DATABASE ?? 'metrics',
      };
    case 'mysql':
      return {
        ...base,
        type: 'mysql',
        host: process.env.MYSQL_HOST,
        port: Number(process.env.MYSQL_PORT ?? 3306),
        username: process.env.MYSQL_USER ?? 'metrics',
        password: process.env.MYSQL_PASSWORD ?? 'metrics',
        database: process.env.MYSQL_DATABASE ?? 'metrics',
      };
    default:
      return { ...base, type: 'better-sqlite3', database: ':memory:' };
  }
}

export async function createOrdersDataSource(
  driver: TestDriver = 'better-sqlite3',
): Promise<DataSource> {
  const dataSource = new DataSource(optionsFor(driver));
  await dataSource.initialize();
  return dataSource;
}

/** Remove all rows so each test starts from a clean table. */
export async function resetOrders(dataSource: DataSource): Promise<void> {
  await dataSource.getRepository(Order).clear();
}

export async function seedOrders(
  dataSource: DataSource,
  rows: SeedOrder[],
): Promise<void> {
  const repo = dataSource.getRepository(Order);
  await repo.insert(
    rows.map((row) => ({
      status: row.status ?? 'pending',
      amount: row.amount ?? 100,
      created_at: row.createdAt,
      updated_at: row.createdAt,
    })),
  );
}

export function ordersQuery(
  dataSource: DataSource,
): SelectQueryBuilder<OrderRow> {
  return dataSource.getRepository(Order).createQueryBuilder('orders');
}
