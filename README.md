# metrics

Generate **metrics** (aggregate values) and **trends** (chart-ready time series)
from your database, through a fluent API — a TypeScript port of
[`eliseekn/laravel-metrics`](https://github.com/eliseekn/laravel-metrics).

One shared **ORM-agnostic engine**, with adapters per stack — the same fluent API
runs over TypeORM, Prisma or Drizzle.

## Packages

| Package | What it is | Install |
| --- | --- | --- |
| [`nestjs-metrics-core`](packages/core) | The engine + fluent API. Dual-mode: a TypeORM query builder, or a raw-SQL executor for any driver. | `npm i nestjs-metrics-core` |
| [`nestjs-metrics`](packages/nestjs-metrics) | The engine (`.`) + a NestJS module (`/nestjs`). | `npm i nestjs-metrics` |
| [`nextjs-metrics`](packages/nextjs-metrics) | The engine + Prisma & Drizzle adapters, for Next.js / any Node runtime. | `npm i nextjs-metrics` |

`nestjs-metrics` and `nextjs-metrics` both depend on `nestjs-metrics-core` — one
engine, two framework-flavoured packages. The terminals (`metrics()`, `trends()`,
`metricsWithVariations()`) are **async**.

## Quick start

### NestJS / TypeORM — `nestjs-metrics`

```ts
import { MetricsModule, MetricsService } from 'nestjs-metrics/nestjs';

@Module({ imports: [MetricsModule.forRoot({ locale: 'pt-BR', timezone: 'America/Sao_Paulo' })] })
export class AppModule {}

// inside a provider:
this.metrics.query(orderRepo.createQueryBuilder('orders')).sumByMonth('amount').forYear(2026).trends();
```

### Prisma — `nextjs-metrics`

```ts
import { prismaMetrics } from 'nextjs-metrics';

await prismaMetrics(prisma, { table: 'orders', dateColumn: 'created_at', dialect: 'postgres' })
  .sumByMonth('amount').forYear(2026).fillMissingData().trends();
```

### Drizzle — `nextjs-metrics` (typed table → names + dialect inferred)

```ts
import { drizzleMetrics } from 'nextjs-metrics';
import { orders } from './schema';

await drizzleMetrics(db, { table: orders, dateColumn: orders.createdAt }).sum('amount').metrics();
```

### Standalone engine — `nestjs-metrics-core`

```ts
import { Metrics, type DataSource } from 'nestjs-metrics-core';

// TypeORM query builder
await Metrics.query(orderRepo.createQueryBuilder('orders')).count().metrics();

// or any driver, via the executor mode
const dataSource: DataSource = { dialect: 'postgres', execute: (sql, params) => pool.query(sql, params).then((r) => r.rows) };
await Metrics.queryExecutor(dataSource, { table: 'orders', dateColumn: 'created_at' }).sumByMonth('amount').trends();
```

See each package's README for the full API. Intentional differences from the
original Laravel library are in [DIVERGENCES.md](./DIVERGENCES.md); architecture in
[docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md).

## NestJS guide

A comprehensive guide covering all features, queries, filters and usage patterns
for the NestJS module is available at
[`docs/NESTJS-GUIDE.md`](./docs/NESTJS-GUIDE.md) and on the
[NestJ ReadMe](https://nestjs-metrics.readme.io/docs/getting-started) (English).

## API reference

Every public API — the fluent `MetricsBuilder`, the repository helpers, the
executor types, the NestJS module and the Prisma/Drizzle adapters — ships JSDoc
with usage examples, so your editor surfaces it inline. Generate the full HTML
reference with [TypeDoc](https://typedoc.org):

```bash
docker compose run --rm dev npm run docs:api   # writes docs/api/
```

Full API reference is also available on the
[NestJ ReadMe](https://nestjs-metrics.readme.io/docs/getting-started).

## Development

npm-workspaces monorepo. Everything runs in Docker:

```bash
docker compose run --rm dev npm install
docker compose run --rm dev npm run typecheck
docker compose run --rm dev npm test            # SQLite
docker compose up -d --wait postgres mysql
bash scripts/load-mysql-tz.sh                    # MySQL named timezones (for tz tests)
docker compose run --rm -e PG_HOST=postgres -e MYSQL_HOST=mysql dev npm test
docker compose run --rm dev npm run build        # builds all packages
```

Releases use Changesets — see [docs/RELEASING.md](./docs/RELEASING.md).

## License

MIT
