# @pedropcardoso/metrics-core

The ORM-agnostic metrics & trends engine and its fluent API. Two entry points:

- `Metrics.query(qb)` — over a **TypeORM** `SelectQueryBuilder`.
- `Metrics.queryExecutor(dataSource, spec)` — over **any driver** via a
  `(sql, params) => rows` executor (the basis of the Prisma/Drizzle adapters in
  [`@pedropcardoso/metrics-nextjs`](../nextjs)).

```bash
npm i @pedropcardoso/metrics-core
```

`typeorm` is an **optional** peer — only needed for the `Metrics.query` path.
The terminals (`metrics()`, `trends()`, `metricsWithVariations()`) are **async**.

## Entry points

### TypeORM query builder

```ts
import { Metrics, metricsFor, withMetrics } from '@pedropcardoso/metrics-core';

await Metrics.query(orderRepo.createQueryBuilder('orders')).sum('amount').byMonth().forYear(2026).trends();
await metricsFor(orderRepo).count().byYear().metrics();           // repository helper
await withMetrics(orderRepo).metrics().countByMonth().trends();   // extend the repo
```

### Any driver (executor mode)

```ts
import { Metrics, type DataSource } from '@pedropcardoso/metrics-core';

const dataSource: DataSource = {
  dialect: 'postgres',
  execute: (sql, params) => pool.query(sql, params).then((r) => r.rows),
};

await Metrics.queryExecutor(dataSource, { table: 'orders', dateColumn: 'created_at' })
  .sumByMonth('amount')
  .forYear(2026)
  .fillMissingData()
  .trends();
```

## API

### Aggregates · Periods · Reference point

```ts
.count(column = 'id')  .sum(column)  .average(column)  .max(column)  .min(column)
.byDay(count = 0)  .byWeek(count = 0)  .byMonth(count = 0)  .byYear(count = 0)
.forDay(d)  .forWeek(w /* ISO week */)  .forMonth(m)  .forYear(y)
```

`count = 0` → the whole period · `count = 1` → a single unit · `count > 1` → the
last-`n` window.

### Date ranges · Targeting

```ts
.between(start, end /* 'YYYY-MM-DD' */)  .from(date)
.groupByDay() | .groupByWeek() | .groupByMonth() | .groupByYear()
.dateColumn(column)  .table(name)  .labelColumn(column)
```

### Outputs · Modifiers

```ts
.metrics()                                  // → number
.trends(inPercent = false)                  // → { labels, data }
.metricsWithVariations(prevCount, prevPeriod, inPercent = false)
.fillMissingData(value = 0, labels = [])
.groupData(labels, aggregate = Aggregate.SUM)   // multi-series → { total, [label]: [] }
```

### Combined shorthands

```ts
.countByMonth(column?, count?)   .sumByYear(column, count?)   .averageByWeek(column, count?)
.countBetween([start, end], column?)   .sumFrom(date, column)   // …all by-period/Between/From shorthands
```

### Locale & timezone

```ts
Metrics.query(qb, { locale: 'pt-BR', timezone: 'America/Sao_Paulo' });
```

Labels are translated via the locale (default `en`). A non-UTC `timezone`
converts the date column before bucketing (DST-correct) on Postgres/MySQL; on
SQLite, timezone conversion is supported via the TypeORM path but **not** the
executor mode (which is UTC-only and throws on a non-UTC timezone).

### Errors

Typed exceptions: `InvalidAggregateException`, `InvalidPeriodException`,
`InvalidDateFormatException`, `InvalidVariationsCountException`,
`InvalidIdentifierException`, `InvalidTimezoneException`,
`SqliteTimezoneUnsupportedException`. Identifiers are validated and escaped —
keep them developer-controlled, not user input.

## License

MIT
