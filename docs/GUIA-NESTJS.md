# Complete Guide — `nestjs-metrics`

> Generate **metrics** (aggregated values) and **trends** (time-series ready for
> charts) from TypeORM entities, with a fluent API and NestJS integration.

---

## Table of Contents

- [Installation](#installation)
- [Module Registration](#module-registration)
- [The MetricsService](#the-metricsservice)
- [Entry Points](#entry-points)
- [Aggregators](#aggregators)
- [Periods](#periods)
- [Window Semantics](#window-semantics)
- [Date Ranges (between / from)](#date-ranges-between--from)
- [Range Granularity (groupBy*)](#range-granularity-groupby)
- [Temporal Reference (forDay / forWeek / forMonth / forYear)](#temporal-reference-forday--forweek--formonth--foryear)
- [Combined Shorthands](#combined-shorthands)
- [Custom Date Column (dateColumn)](#custom-date-column-datecolumn)
- [Categorical Grouping (labelColumn)](#categorical-grouping-labelcolumn)
- [Terminal Methods](#terminal-methods)
  - [.metrics()](#metrics)
  - [.trends()](#trends)
  - [.metricsWithVariations()](#metricswithvariations)
- [Fill Missing Data (fillMissingData)](#fill-missing-data-fillmissingdata)
- [Multiple Series (groupData)](#multiple-series-groupdata)
- [Percentages (inPercent)](#percentages-inpercent)
- [Timezone](#timezone)
- [Locale / Label Translation](#locale--label-translation)
- [Cache](#cache)
- [Executor Mode (queryExecutor)](#executor-mode-queryexecutor)
- [Structured Filters (WhereInput)](#structured-filters-whereinput)
- [Validation / SkipValidation](#validation--skipvalidation)
- [Error Hierarchy](#error-hierarchy)
- [Repository Helpers (metricsFor / withMetrics)](#repository-helpers-metricsfor--withmetrics)
- [Error Reference Table](#error-reference-table)
- [Complete Example](#complete-example)

---

## Installation

```bash
npm install nestjs-metrics
```

Peer dependencies (must already be in your project):

- `@nestjs/common` ^10 || ^11
- `typeorm` ^0.3
- `nestjs-metrics-core` (installed automatically)

---

## Module Registration

### `forRoot` — global configuration

Registers `MetricsService` as a **global** provider with default locale and
timezone applied to all queries.

```typescript
import { MetricsModule } from 'nestjs-metrics/nestjs';

@Module({
  imports: [
    MetricsModule.forRoot({
      locale: 'en',
      timezone: 'UTC',
    }),
  ],
})
export class AppModule {}
```

### `forFeature` — per-module override

Allows overriding global options within a specific module. Options from
`forFeature` are **merged** on top of `forRoot`:

```typescript
@Module({
  imports: [MetricsModule.forFeature({ locale: 'fr' })],
  providers: [ReportsService],
})
export class ReportsModule {}
```

### `MetricsModuleOptions`

```typescript
interface MetricsModuleOptions {
  locale?: string;   // BCP-47 tag, e.g. 'en', 'pt-BR', 'fr'
  timezone?: string; // IANA timezone, e.g. 'UTC', 'America/New_York'
}
```

> ⚠️ The schema is validated with Zod. Invalid locales (e.g. `''`) throw
> `ValidationError`.

---

## The MetricsService

Injectable with scope based on where it was registered:

```typescript
import { MetricsService } from 'nestjs-metrics/nestjs';

@Injectable()
export class OrdersService {
  constructor(private readonly metrics: MetricsService) {}
}
```

### `.query()` method

Opens a `MetricsBuilder` over a TypeORM `SelectQueryBuilder`:

```typescript
this.metrics
  .query(orderRepo.createQueryBuilder('orders'))
  .countByMonth('id')
  .trends();
```

### Option precedence (locale/timezone)

**call-site** > **forFeature** > **forRoot** > **default (`'en'`, `'UTC'`)**

```typescript
// forRoot locale = 'en'
// forFeature locale = 'fr'  (inside ReportsModule)
// call-site locale = 'de'   → wins
this.metrics
  .query(ordersQuery, { locale: 'de' })
  .countByMonth()
  .trends();
```

---

## Entry Points

All produce the **same result** for the same query.

### 1. Via `MetricsService` (NestJS)

```typescript
this.metrics
  .query(orderRepo.createQueryBuilder('orders'))
  .sum('amount')
  .metrics();
```

### 2. Via `Metrics.query()` (static, without NestJS)

```typescript
import { Metrics } from 'nestjs-metrics';
// or import { Metrics } from 'nestjs-metrics-core';

const result = await Metrics
  .query(orderRepo.createQueryBuilder('orders'))
  .count()
  .metrics();
```

### 3. Via `metricsFor(repo)`

```typescript
import { metricsFor } from 'nestjs-metrics';

const result = await metricsFor(orderRepo)
  .sumByMonth('amount')
  .trends();
```

### 4. Via `withMetrics(repo)`

Extends the repository with a `.metrics()` method:

```typescript
import { withMetrics } from 'nestjs-metrics';

const repo = withMetrics(orderRepo);
const result = await repo
  .metrics()
  .countByMonth()
  .trends();
```

### 5. Via `MetricsBuilder.queryExecutor()` (raw SQL, without TypeORM)

```typescript
import { MetricsBuilder } from 'nestjs-metrics-core';

const ds: DataSource = {
  dialect: 'postgres',
  execute: (sql, params) => pool.query(sql, params).then(r => r.rows),
};

const result = await MetricsBuilder
  .queryExecutor(ds, { table: 'orders', dateColumn: 'created_at' })
  .sumByMonth('amount')
  .trends();
```

---

## Aggregators

| Method       | SQL      | Description                  | Default `column` |
|-------------|----------|------------------------------|------------------|
| `.count()`  | `COUNT`  | Number of rows               | `'id'`           |
| `.sum()`    | `SUM`    | Sum of a numeric column      | (required)       |
| `.average()`| `AVG`    | Average of a numeric column  | (required)       |
| `.max()`    | `MAX`    | Largest value in the column  | (required)       |
| `.min()`    | `MIN`    | Smallest value in the column | (required)       |

```typescript
// Simple count (default column 'id')
await Metrics.query(qb).count().metrics();

// Sum of a specific column
await Metrics.query(qb).sum('amount').metrics();

// Average
await Metrics.query(qb).average('amount').metrics();

// Max / Min
await Metrics.query(qb).max('amount').metrics();
await Metrics.query(qb).min('amount').metrics();
```

> The `column` parameter is validated as a safe SQL identifier. Special characters
> or SQL injection attempts throw `InvalidIdentifierException`.

---

## Periods

Define how data is grouped over time. Used with `.trends()` or with `.metrics()`
(for temporal scoping without grouping).

| Method                    | Bucket     | Labels (trends)        |
|--------------------------|------------|------------------------|
| `.byDay(count?)`         | Day        | Day of the week name   |
| `.byWeek(count?)`        | ISO Week   | `Week N`               |
| `.byMonth(count?)`       | Month      | Month name             |
| `.byYear(count?)`        | Year       | Year number            |

```typescript
// Group by month
await Metrics.query(qb).count().byMonth().trends();
// → { labels: ['January', 'February', ...], data: [10, 15, ...] }
```

> See "Window Semantics" below for the meaning of the `count` parameter.

---

## Window Semantics

The `count` parameter in period methods controls the time window:

| `count` | Behavior                                                        |
|---------|-----------------------------------------------------------------|
| `0`     | **Entire** period (e.g. the whole year, no window filter)       |
| `1`     | **Only** the current unit (e.g. this month)                     |
| `>1`    | **Last N units** up to the reference (e.g. last 3 months)       |

```typescript
// Whole year (default)
await Metrics.query(qb).count().byMonth().forYear(2026).metrics();
// → total for the year

// Only June 2026
await Metrics.query(qb).count().byMonth(1).forYear(2026).forMonth(6).metrics();

// Last 3 months up to June 2026
await Metrics.query(qb).count().byMonth(3).forYear(2026).forMonth(6).metrics();
// → window = months 3..6 (March to June)
```

### Year window examples

```typescript
// Only 2024
await m().count().byYear(1).forYear(2024).metrics();

// Last 3 years [2021..2024]
await m().count().byYear(3).forYear(2024).metrics();
```

---

## Date Ranges (between / from)

Replace the period with an explicit date interval. Labels in `.trends()` are the
dates themselves (ISO format).

### `.between(start, end)`

```typescript
// Days within January 2026
await Metrics.query(qb)
  .count()
  .between('2026-01-01', '2026-01-31')
  .trends();
// → { labels: ['2026-01-10', '2026-01-12'], data: [2, 1] }
```

### `.from(date)`

Shorthand for `between(date, today())`.

```typescript
await Metrics.query(qb).count().from('2026-06-01').metrics();
```

### Range shorthands

```typescript
.countBetween(['2026-01-01', '2026-12-31'])
.sumBetween(['2026-01-01', '2026-12-31'], 'amount')
.averageBetween(['2026-01-01', '2026-12-31'], 'amount')
.maxBetween(['2026-01-01', '2026-12-31'], 'amount')
.minBetween(['2026-01-01', '2026-12-31'], 'amount')

.countFrom('2020-01-01')
.sumFrom('2020-01-01', 'amount')
.averageFrom('2020-01-01', 'amount')
.maxFrom('2020-01-01', 'amount')
.minFrom('2020-01-01', 'amount')
```

---

## Range Granularity (groupBy*)

When using `.between()`/`.from()`, the default bucket is **day**. Use `groupBy*`
to change it:

```typescript
// By month
await m().count().between('2026-01-01', '2026-03-31').groupByMonth().trends();
// → { labels: ['2026-01', '2026-02', '2026-03'], data: [2, 1, 1] }

// By year
await m().count().between('2026-01-01', '2026-12-31').groupByYear().trends();

// By ISO week
await m().count().between('2026-03-01', '2026-03-15').groupByWeek().trends();
// → { labels: ['2026-W10', '2026-W11'], ... }

// By day (explicit, equivalent to the default)
await m().count().between('2026-01-01', '2026-01-31').groupByDay().trends();
```

---

## Temporal Reference (forDay / forWeek / forMonth / forYear)

Pins that define the reference point for periods. The default is "now"
(current date/time).

```typescript
// Specific day
await Metrics.query(qb)
  .count().byDay(1)
  .forYear(2026).forMonth(6).forDay(2)
  .metrics();

// Specific ISO week
await Metrics.query(qb)
  .count().byWeek(1)
  .forYear(2026).forMonth(3).forWeek(11)
  .metrics();

// Specific month
await Metrics.query(qb)
  .count().byMonth(1)
  .forYear(2026).forMonth(6)
  .metrics();

// Specific year
await Metrics.query(qb)
  .count().byMonth()
  .forYear(2026)
  .trends();
```

---

## Combined Shorthands

Shortcuts combining aggregator + period in a single call:

| Shorthand                | Equivalent                         |
|--------------------------|------------------------------------|
| `.countByDay(col, n)`    | `.count(col).byDay(n)`             |
| `.countByWeek(col, n)`   | `.count(col).byWeek(n)`            |
| `.countByMonth(col, n)`  | `.count(col).byMonth(n)`           |
| `.countByYear(col, n)`   | `.count(col).byYear(n)`            |
| `.sumByDay(col, n)`      | `.sum(col).byDay(n)`               |
| `.sumByWeek(col, n)`     | `.sum(col).byWeek(n)`              |
| `.sumByMonth(col, n)`    | `.sum(col).byMonth(n)`             |
| `.sumByYear(col, n)`     | `.sum(col).byYear(n)`              |
| `.averageByDay(col, n)`  | `.average(col).byDay(n)`           |
| `.averageByWeek(col, n)` | `.average(col).byWeek(n)`          |
| `.averageByMonth(col, n)`| `.average(col).byMonth(n)`         |
| `.averageByYear(col, n)` | `.average(col).byYear(n)`          |
| `.maxByDay(col, n)`      | `.max(col).byDay(n)`               |
| `.maxByWeek(col, n)`     | `.max(col).byWeek(n)`              |
| `.maxByMonth(col, n)`    | `.max(col).byMonth(n)`             |
| `.maxByYear(col, n)`     | `.max(col).byYear(n)`              |
| `.minByDay(col, n)`      | `.min(col).byDay(n)`               |
| `.minByWeek(col, n)`     | `.min(col).byWeek(n)`              |
| `.minByMonth(col, n)`    | `.min(col).byMonth(n)`             |
| `.minByYear(col, n)`     | `.min(col).byYear(n)`              |

```typescript
await Metrics.query(qb).countByMonth('id', 6).forYear(2026).trends();
await Metrics.query(qb).sumByYear('amount', 5).trends();
```

---

## Custom Date Column (dateColumn)

By default the builder uses `created_at` as the date column. To use a different one:

```typescript
await Metrics.query(qb)
  .count()
  .dateColumn('updated_at')
  .byMonth()
  .forYear(2026)
  .trends();
// → Groups by updated_at instead of created_at
```

---

## Categorical Grouping (labelColumn)

Groups the series by a categorical column **instead of** by period. The temporal
filter still applies — use `forYear`/`between` etc. for scope.

```typescript
// Total orders grouped by status (in 2026)
await Metrics.query(qb)
  .count()
  .labelColumn('status')
  .forYear(2026)
  .trends();
// → { labels: ['delivered', 'pending', 'cancelled'], data: [10, 5, 2] }
```

Combined with period + `forYear`:

```typescript
await Metrics.query(qb)
  .sumByYear('amount', 1)
  .forYear(2026)
  .labelColumn('status')
  .trends();
// → { labels: ['paid', 'pending', 'refunded'], data: [750, 75, 75] }
```

> The period filter still applies. To group by status within a year,
> use `sumByYear('amount', 1).forYear(YYYY).labelColumn('status')`.

### Switching the Table (table())

For metrics over joins:

```typescript
await Metrics.query(ordersJoinCustomers(dataSource))
  .count()
  .table('customers')
  .labelColumn('name')
  .trends();
// → { labels: ['Acme', 'Globex'], data: [2, 1] }
```

---

## Terminal Methods

### `.metrics()`

Returns a single aggregated numeric value.

```typescript
const total = await Metrics.query(qb).sum('amount').metrics();
// → number (or 0 if no rows match)
```

### `.trends()`

Returns time-series data ready for charting.

```typescript
const { labels, data } = await Metrics.query(qb).countByMonth().trends();
// → TrendsResult: { labels: (string | number)[], data: number[] }
```

**With `groupData()`** returns `GroupedTrendsResult`:

```typescript
const { labels, data } = await Metrics.query(qb)
  .countByMonth('status')
  .groupData(['pending', 'delivered'])
  .trends();
// → GroupedTrendsResult: { labels: [...], data: { total: [...], pending: [...], delivered: [...] } }
```

### `.metricsWithVariations()`

Returns the current value plus the variation against a previous period.

```typescript
interface VariationResult {
  count: number;
  variation: {
    type: 'increase' | 'decrease' | 'none';
    value: number | string; // string when inPercent=true
  };
}
```

```typescript
// Variation vs previous year
const r = await Metrics.query(qb)
  .count().byYear(1).forYear(2026)
  .metricsWithVariations(1, Period.YEAR);
// → { count: 5, variation: { type: 'increase', value: 3 } }

// As percentage
const r = await Metrics.query(qb)
  .count().byYear(1).forYear(2026)
  .metricsWithVariations(1, Period.YEAR, true);
// → { count: 6, variation: { type: 'increase', value: '50%' } }
```

> `previousCount` must be > 0. `previousPeriod` must be one of:
> `Period.DAY | Period.WEEK | Period.MONTH | Period.YEAR`.

---

## Fill Missing Data (fillMissingData)

By default, `.trends()` only returns buckets that have data.
`fillMissingData()` fills the gaps with a default value.

```typescript
await Metrics.query(qb)
  .count().byMonth().forYear(2026)
  .fillMissingData()
  .trends();
// → { labels: ['January', 'February', 'March'], data: [1, 0, 1] }
```

### Behavior by mode

| Mode                    | Strategy                                                    |
|-------------------------|-------------------------------------------------------------|
| Period (byMonth etc.)   | Fills between the **smallest and largest** bucket present   |
| Range (between/from)    | Enumerates the **entire** range                             |
| Categorical (labelColumn)| Auto-discovers **distinct** labels or uses an explicit list|

### Custom fill value

```typescript
.fillMissingData(99)
// → data: [1, 99, 1]
```

### Explicit labels (categorical mode)

```typescript
await Metrics.query(qb)
  .count()
  .labelColumn('status')
  .fillMissingData(0, ['pending', 'delivered', 'cancelled'])
  .trends();
// → { labels: ['pending', 'delivered', 'cancelled'], data: [2, 1, 0] }
```

---

## Multiple Series (groupData)

Splits the aggregator column into one series per value — ideal for stacked charts.
Each series uses `CASE WHEN column = value THEN 1 ELSE 0 END`.

```typescript
await Metrics.query(qb)
  .countByMonth('status')
  .groupData(['pending', 'delivered', 'cancelled'])
  .forYear(2026)
  .trends();
// → GroupedTrendsResult
// labels: ['January', 'March']
// data.total:     [3, 2]
// data.pending:   [2, 1]
// data.delivered: [1, 0]
// data.cancelled: [0, 1]
```

### With fillMissingData

```typescript
await Metrics.query(qb)
  .countByMonth('status')
  .groupData(['pending', 'delivered'])
  .forYear(2026)
  .fillMissingData()
  .trends();
// → data.total: [2, 0, 1], data.pending: [1, 0, 1], data.delivered: [1, 0, 0]
// labels: ['January', 'February', 'March']
```

### Custom aggregator

```typescript
.groupData(['pending', 'delivered'], Aggregate.SUM)
```

---

## Percentages (inPercent)

`trends(true)` converts each value to a percentage of the series total.

```typescript
const r = await Metrics.query(qb)
  .count().byMonth().forYear(2026)
  .trends(true);
// → { labels: ['January', 'March'], data: [75, 25] }
```

Compatible with `fillMissingData`:

```typescript
await m().count().byMonth().forYear(2026).fillMissingData().trends(true);
// → { labels: ['January', 'February', 'March'], data: [75, 0, 25] }
```

---

## Timezone

By default the timezone is `'UTC'`. Configure an IANA timezone for bucketing
in local time.

```typescript
// Global scope (forRoot)
MetricsModule.forRoot({ timezone: 'America/New_York' });

// Per query (call-site)
Metrics.query(qb, { timezone: 'America/New_York' });
```

### Example: row near midnight

```typescript
// created_at = '2026-07-15 03:30:00' (UTC)
// In New York (-4 EDT) → 23:30 on July 14

const q = () => Metrics.query(qb, { timezone: 'America/New_York' });

await q().count().between('2026-07-14', '2026-07-14').metrics();
// → 1 (in local time it's the 14th)

await q().count().between('2026-07-15', '2026-07-15').metrics();
// → 0
```

### Trends in local timezone

```typescript
const r = await Metrics.query(qb, { timezone: 'America/New_York' })
  .count()
  .between('2026-07-13', '2026-07-16')
  .groupByDay()
  .trends();
// → labels: ['2026-07-14'], data: [1]
```

> ⚠️ **SQLite** does not support timezone in executor mode. Throws
> `SqliteTimezoneUnsupportedException`.

---

## Locale / Label Translation

Controls the language of month and day-of-week names in `.trends()` results.

```typescript
Metrics.query(qb, { locale: 'pt-BR' })
  .count().byMonth()
  .trends();
// → labels: ['janeiro', 'fevereiro', ...]

Metrics.query(qb, { locale: 'fr' })
  .count().byMonth()
  .trends();
// → labels: ['janvier', 'février', ...]
```

Default value: `'en'`.

---

## Cache

Pluggable, opt-in cache system. Cache is per **query plan** (aggregator + column
+ filters + timezone), so different queries get different keys.

### Enable cache

```typescript
import { MemoryCacheStore } from 'nestjs-metrics';

const cache = new MemoryCacheStore();
const opts = { cache: { enabled: true, ttl: 60 } }; // 60 seconds

const result = await Metrics.query(qb, opts, cache)
  .count()
  .metrics();
```

### Custom CacheStore

Implement the `CacheStore` interface:

```typescript
import type { CacheStore } from 'nestjs-metrics-core';

class MyRedisStore implements CacheStore {
  get<T>(key: string): T | undefined { /* ... */ }
  set<T>(key: string, value: T, ttl: number): void { /* ... */ }
  del(key: string): void { /* ... */ }
  clear(): void { /* ... */ }
  stats(): CacheStats { /* ... */ }
}
```

### CacheStore methods

| Method      | Description                                          |
|-------------|------------------------------------------------------|
| `get(key)`  | Returns value or `undefined` if not found            |
| `set(key, value, ttl)` | Stores with TTL in seconds                |
| `del(key)`  | Removes entry                                        |
| `clear()`   | Clears everything and resets statistics              |
| `stats()`   | Returns `{ hits, misses, size }`                     |

---

## Executor Mode (queryExecutor)

Used **without TypeORM** — with Prisma, Drizzle, or any SQL driver. Requires a
`DataSource` with `dialect` + `execute`.

### DataSource

```typescript
interface DataSource {
  dialect: 'postgres' | 'mysql' | 'sqlite';
  execute: (sql: string, params: unknown[]) => Promise<Row[]>;
}
```

### Basic example

```typescript
import { MetricsBuilder } from 'nestjs-metrics-core';

const dataSource: DataSource = {
  dialect: 'postgres',
  execute: (sql, params) => pool.query(sql, params).then(r => r.rows),
};

const result = await MetricsBuilder
  .queryExecutor(dataSource, { table: 'orders', dateColumn: 'created_at' })
  .sumByMonth('amount')
  .forYear(2026)
  .fillMissingData()
  .trends();
```

### ExecutorSpec

```typescript
interface ExecutorSpec {
  table: string;           // Table name (required)
  dateColumn?: string;     // Date column (default read from builder)
  where?: WhereInput;      // Structured filters (optional)
  from?: string;           // Raw FROM fragment (for joins/subqueries)
}
```

---

## Structured Filters (WhereInput)

Available in executor mode via `ExecutorSpec.where`. Filters are **AND** and
values are always passed as named parameters (no injection risk).

```typescript
type WhereInput = Record<string, WhereCondition>;

type WhereCondition =
  | WhereScalar              // = value
  | WhereScalar[]            // IN (...)
  | RangeCondition;          // { gte?, lte?, gt?, lt? }

type WhereScalar = string | number | boolean | null;

interface RangeCondition {
  gte?: WhereScalar;
  lte?: WhereScalar;
  gt?: WhereScalar;
  lt?: WhereScalar;
}
```

### Examples

```typescript
// Equality
{ status: 'paid' }

// IN
{ status: ['paid', 'pending'] }

// Range
{ amount: { gte: 100 } }
{ amount: { gt: 100, lte: 300 } }

// IS NULL
{ customer_id: null }

// Multiple conditions (AND)
{ status: 'paid', amount: { gte: 200 } }
```

### Using with queryExecutor

```typescript
const result = await MetricsBuilder
  .queryExecutor(dataSource, {
    table: 'orders',
    dateColumn: 'created_at',
    where: { status: 'paid', amount: { gte: 100 } },
  })
  .sumByMonth('amount')
  .forYear(2026)
  .fillMissingData()
  .trends();
```

The `where` filters are applied **along with** period/range filters.

---

## Validation / SkipValidation

### Automatic validation

All inputs (builder, executor spec, module options) are validated with **Zod** in
the constructor. Invalid options throw `ValidationError`.

```typescript
Metrics.query(qb, { locale: '' }); // → ValidationError
Metrics.query(qb, { timezone: 123 as never }); // → ValidationError
```

### SkipValidation

To disable validation in performance-critical scenarios:

```typescript
import { Metrics } from 'nestjs-metrics';

Metrics.skipValidation = true; // disables Zod validation on all inputs
// ... queries without validation ...
Metrics.skipValidation = false; // re-enables
```

---

## Error Hierarchy

All exceptions extend `MetricsError` and carry a stable `code`
(machine-readable) and optional `context`.

```
Error
 └─ MetricsError (code + context)
     ├─ ValidationError                    VALIDATION_ERROR
     ├─ InvalidAggregateException          INVALID_AGGREGATE
     ├─ InvalidDateFormatException         INVALID_DATE_FORMAT
     ├─ InvalidIdentifierException         INVALID_IDENTIFIER
     ├─ InvalidPeriodException             INVALID_PERIOD
     ├─ InvalidVariationsCountException    INVALID_VARIATIONS_COUNT
     ├─ InvalidTimezoneException           INVALID_TIMEZONE
     ├─ SqliteTimezoneUnsupportedException SQLITE_TIMEZONE_UNSUPPORTED
     ├─ ConfigurationError                 CONFIGURATION_ERROR
     └─ QueryExecutionError               QUERY_EXECUTION_ERROR
```

### Catching errors

```typescript
import { MetricsError, QueryExecutionError } from 'nestjs-metrics';

try {
  await builder.sum('amount').metrics();
} catch (err) {
  if (err instanceof MetricsError) {
    console.error(err.code, err.context);
  }
}
```

---

## Repository Helpers (metricsFor / withMetrics)

### `metricsFor(repo, options?)`

```typescript
import { metricsFor } from 'nestjs-metrics';

const repo = dataSource.getRepository(Order);
const result = await metricsFor(repo, { locale: 'en' })
  .sumByMonth('amount')
  .trends();
```

### `withMetrics(repo)`

Adds a `.metrics()` method to the repository:

```typescript
import { withMetrics } from 'nestjs-metrics';

const repo = withMetrics(dataSource.getRepository(Order));
const result = await repo
  .metrics()
  .countByMonth()
  .trends();
```

---

## Error Reference Table

| Exception                            | Code                          | Cause                                             |
|--------------------------------------|-------------------------------|---------------------------------------------------|
| `ValidationError`                    | `VALIDATION_ERROR`            | Invalid options (empty locale, etc.)              |
| `InvalidAggregateException`          | `INVALID_AGGREGATE`           | Unsupported aggregator                            |
| `InvalidDateFormatException`         | `INVALID_DATE_FORMAT`         | Date is not in YYYY-MM-DD format                  |
| `InvalidIdentifierException`         | `INVALID_IDENTIFIER`          | Unsafe column/table name                          |
| `InvalidPeriodException`             | `INVALID_PERIOD`              | Invalid period in metricsWithVariations           |
| `InvalidVariationsCountException`    | `INVALID_VARIATIONS_COUNT`    | previousCount <= 0                                |
| `InvalidTimezoneException`           | `INVALID_TIMEZONE`            | Invalid IANA zone                                 |
| `SqliteTimezoneUnsupportedException` | `SQLITE_TIMEZONE_UNSUPPORTED` | Non-UTC timezone in SQLite executor               |
| `ConfigurationError`                 | `CONFIGURATION_ERROR`         | Unsupported driver / dialect not inferred         |
| `QueryExecutionError`                | `QUERY_EXECUTION_ERROR`       | Driver error during SQL execution                 |

---

## Complete Example

```typescript
import { Module } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MetricsModule, MetricsService } from 'nestjs-metrics/nestjs';
import { Order } from './order.entity';
import { Period } from 'nestjs-metrics';

@Module({
  imports: [
    MetricsModule.forRoot({
      locale: 'en',
      timezone: 'UTC',
    }),
  ],
})
export class ReportsModule {
  constructor(
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
    private readonly metrics: MetricsService,
  ) {}

  // --- Simple metrics ---

  async totalRevenue(): Promise<number> {
    return this.metrics
      .query(this.orderRepo.createQueryBuilder('order'))
      .sum('amount')
      .metrics();
  }

  async orderCountThisMonth(): Promise<number> {
    return this.metrics
      .query(this.orderRepo.createQueryBuilder('order'))
      .countByMonth(1) // current month only
      .metrics();
  }

  // --- Trends ---

  async monthlyRevenueTrend() {
    return this.metrics
      .query(this.orderRepo.createQueryBuilder('order'))
      .sumByMonth('amount', 12) // last 12 months
      .fillMissingData()
      .trends();
  }

  async ordersByStatus() {
    return this.metrics
      .query(this.orderRepo.createQueryBuilder('order'))
      .count()
      .labelColumn('status')
      .trends();
  }

  // --- Variation ---

  async revenueVariation() {
    return this.metrics
      .query(this.orderRepo.createQueryBuilder('order'))
      .sumByYear('amount', 1)
      .forYear(2026)
      .metricsWithVariations(1, Period.YEAR, true);
    // → { count: 100000, variation: { type: 'increase', value: '15.5%' } }
  }

  // --- Custom range ---

  async dailyRevenue(days: number) {
    const end = new Date().toISOString().slice(0, 10);
    const start = new Date(Date.now() - days * 86400000)
      .toISOString()
      .slice(0, 10);

    return this.metrics
      .query(this.orderRepo.createQueryBuilder('order'))
      .sum('amount')
      .between(start, end)
      .groupByDay()
      .fillMissingData()
      .trends();
  }

  // --- Multiple series ---

  async stackedStatusByMonth() {
    return this.metrics
      .query(this.orderRepo.createQueryBuilder('order'))
      .countByMonth('status', 6)
      .groupData(['pending', 'paid', 'cancelled'])
      .fillMissingData()
      .trends();
  }
}
```
