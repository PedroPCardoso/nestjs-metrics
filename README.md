# metrics-kit

Generate **metrics** (aggregate values) and **trends** (chart-ready time series)
from your database, through a fluent API — a TypeScript port of
[`eliseekn/laravel-metrics`](https://github.com/eliseekn/laravel-metrics).

The engine is **ORM-agnostic**: the same fluent API runs over TypeORM, Prisma,
Drizzle, or any driver that can execute a SQL string.

- Aggregates: `count` / `sum` / `average` / `max` / `min`
- Periods: `byDay` / `byWeek` / `byMonth` / `byYear`, windows, date ranges
- SQLite, PostgreSQL and MySQL/MariaDB, with **ISO-8601 weeks** everywhere
- Locale-translated labels (Luxon) and **timezone-aware bucketing** (Postgres/MySQL)
- `fillMissingData`, `groupData` (multi-series), percentage trends, variations

## Packages

| Package | What it is | Install |
| --- | --- | --- |
| [`@metrics-kit/core`](packages/core) | The engine + fluent API. Dual-mode: a TypeORM query builder, or a raw-SQL executor for any driver. | `npm i @metrics-kit/core` |
| [`@metrics-kit/nestjs`](packages/nestjs) | NestJS module + injectable service (TypeORM). | `npm i @metrics-kit/nestjs` |
| [`@metrics-kit/nextjs`](packages/nextjs) | Prisma & Drizzle adapters for Next.js / any Node runtime. | `npm i @metrics-kit/nextjs` |
| [`nestjs-metrics`](packages/nestjs-metrics) | Back-compat façade: re-exports core (`.`) + nestjs (`./nestjs`). | `npm i nestjs-metrics` |

The terminals (`metrics()`, `trends()`, `metricsWithVariations()`) are **async**.

## Quick start

### Prisma (Next.js / Node)

```ts
import { prismaMetrics } from '@metrics-kit/nextjs/prisma';

const revenueByMonth = await prismaMetrics(prisma, {
  table: 'orders',
  dateColumn: 'created_at',
  dialect: 'postgres',
})
  .sumByMonth('amount')
  .forYear(2026)
  .fillMissingData()
  .trends(); // → { labels: ['January', …], data: [1200, 980, …] }
```

### Drizzle (typed table → names + dialect inferred)

```ts
import { drizzleMetrics } from '@metrics-kit/nextjs/drizzle';
import { orders } from './schema';

const total = await drizzleMetrics(db, { table: orders, dateColumn: orders.createdAt })
  .sum('amount')
  .metrics(); // → number
```

### NestJS / TypeORM

```ts
import { MetricsModule, MetricsService } from '@metrics-kit/nestjs';

@Module({ imports: [MetricsModule.forRoot({ locale: 'pt-BR', timezone: 'America/Sao_Paulo' })] })
export class AppModule {}

// inside a provider:
this.metrics.query(orderRepo.createQueryBuilder('orders')).sumByMonth('amount').forYear(2026).trends();
```

### Standalone (TypeORM query builder)

```ts
import { Metrics } from '@metrics-kit/core';

await Metrics.query(orderRepo.createQueryBuilder('orders')).count().metrics();
```

See each package's README for the full API and options. Intentional differences
from the original Laravel library are listed in [DIVERGENCES.md](./DIVERGENCES.md);
the architecture is in [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md).

## Development

This is an npm-workspaces monorepo. Everything runs in Docker:

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
