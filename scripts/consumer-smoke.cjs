// Runs INSIDE a throwaway project that has installed the packed tarball, so it
// exercises the real package: the exports map, CJS interop, and types-free
// require() by package name — exactly what a consumer does.
const assert = require('assert');
require('reflect-metadata');
const { DataSource, EntitySchema } = require('typeorm');
const { Metrics, metricsFor, withMetrics } = require('nestjs-metrics');
const { MetricsModule, MetricsService } = require('nestjs-metrics/nestjs');

const Order = new EntitySchema({
  name: 'Order',
  tableName: 'orders',
  columns: {
    id: { type: Number, primary: true, generated: true },
    amount: { type: 'decimal', precision: 10, scale: 2, default: 0 },
    created_at: { type: Date, nullable: true },
  },
});

(async () => {
  const ds = new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities: [Order],
    synchronize: true,
  });
  await ds.initialize();
  const repo = ds.getRepository(Order);
  await repo.insert([
    { amount: 100, created_at: '2026-01-10 10:00:00' },
    { amount: 200, created_at: '2026-03-10 10:00:00' },
  ]);

  const trends = await Metrics.query(repo.createQueryBuilder('orders'))
    .sum('amount')
    .byMonth()
    .forYear(2026)
    .trends();
  assert.deepStrictEqual(trends.labels, ['January', 'March']);
  assert.deepStrictEqual(trends.data, [100, 200]);

  assert.strictEqual(await metricsFor(repo).sum('amount').byYear().metrics(), 300);
  assert.strictEqual(await withMetrics(repo).metrics().count().byYear().metrics(), 2);

  assert.strictEqual(typeof MetricsModule.forRoot, 'function');
  assert.strictEqual(typeof MetricsService, 'function');

  await ds.destroy();
  console.log('✓ consumer smoke OK — package imports and works as CJS (core + /nestjs)');
})().catch((err) => {
  console.error('✗ consumer smoke FAILED');
  console.error(err);
  process.exit(1);
});
