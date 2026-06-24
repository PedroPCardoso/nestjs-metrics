# @metrics-kit/nextjs

Metrics & trends for **Prisma** and **Drizzle**, usable from Next.js Server
Components / Route Handlers or any Node runtime. Thin adapters over
[`@metrics-kit/core`](../core)'s ORM-agnostic executor — the same fluent API as
the TypeORM path.

```bash
npm i @metrics-kit/nextjs
```

`@prisma/client` and `drizzle-orm` are **optional peer dependencies** — install
only the one you use. The two adapters live under isolated subpaths, so importing
one never loads the other.

The terminals (`metrics()`, `trends()`) are **async**.

## Prisma

```ts
import { prismaMetrics } from '@metrics-kit/nextjs/prisma';

// Prisma can't report its provider at runtime — state the dialect.
const builder = prismaMetrics(prisma, {
  table: 'orders',
  dateColumn: 'created_at',
  dialect: 'postgres',          // 'postgres' | 'mysql' | 'sqlite'
  where: { status: 'paid' },    // optional structured filter
});

await builder.sum('amount').metrics();                              // → number
await builder.sumByMonth('amount').forYear(2026).fillMissingData().trends();
```

The emitted SQL runs through `prisma.$queryRawUnsafe`; values are bound as
positional parameters (never interpolated).

## Drizzle

Pass the typed table/column objects — the SQL names and the **dialect** are
inferred from them:

```ts
import { drizzleMetrics } from '@metrics-kit/nextjs/drizzle';
import { orders } from './schema';

await drizzleMetrics(db, { table: orders, dateColumn: orders.createdAt })
  .countByMonth()
  .forYear(2026)
  .trends();
```

Or use plain strings with an explicit `dialect`:

```ts
await drizzleMetrics(db, { table: 'orders', dateColumn: 'created_at', dialect: 'sqlite' })
  .count()
  .metrics();
```

The adapter runs SQL through the underlying driver Drizzle wraps (`db.$client`):
`better-sqlite3`, `node-postgres`, or `mysql2`.

## Filters

`where` supports equality, `IN`, range and `IS NULL`:

```ts
{ where: { status: 'paid' } }                       // status = ?
{ where: { status: ['paid', 'pending'] } }          // status IN (?, ?)
{ where: { amount: { gte: 100, lt: 500 } } }        // amount >= ? AND amount < ?
{ where: { customer_id: null } }                    // customer_id IS NULL
```

For joins / sources the structured shape can't express, pass a raw `from`
fragment (a **trusted developer surface** — never interpolate user input):

```ts
{ from: '(SELECT * FROM orders JOIN customers USING (customer_id)) t' }
```

## Notes

- **Timezone:** Postgres/MySQL get full timezone-aware bucketing via emitted SQL.
  SQLite is UTC-only in the executor mode (a non-UTC timezone throws).
- **Safety:** table/column/label identifiers are validated against an allowlist
  and quoted per dialect; all values bind as parameters.

See [`@metrics-kit/core`](../core) for the complete fluent API.

## License

MIT
