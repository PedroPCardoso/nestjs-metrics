# nestjs-metrics

Generate **metrics** (aggregate values) and **trends** (chart-ready time series)
from your TypeORM entities, through a fluent API — a TypeScript/NestJS port of
[`eliseekn/laravel-metrics`](https://github.com/eliseekn/laravel-metrics).

- Aggregates: `count` / `sum` / `average` / `max` / `min`
- Periods: `byDay` / `byWeek` / `byMonth` / `byYear`, windows, date ranges
- SQLite, PostgreSQL and MySQL/MariaDB, with **ISO-8601 weeks** everywhere
- Locale-translated labels (Luxon) and **timezone-aware bucketing**
- `fillMissingData`, `groupData` (multi-series), percentage trends, variations
- First-class **NestJS** module, plus standalone and repository entry points

> Intentional differences from the original are listed in [DIVERGENCES.md](./DIVERGENCES.md).

## Requirements

```
Node >= 18
typeorm ^0.3   (peer)
@nestjs/common ^10 || ^11   (optional peer — only for the NestJS module)
```

## Installation

```bash
npm install nestjs-metrics
```

## Usage

The terminals (`metrics()`, `trends()`, `metricsWithVariations()`) are **async**.

### Standalone

```ts
import { Metrics } from 'nestjs-metrics';

// trend of orders amount sum, by month of 2026
const result = await Metrics.query(orderRepo.createQueryBuilder('orders'))
  .sum('amount')
  .byMonth()
  .forYear(2026)
  .trends();
// → { labels: ['January', 'March', ...], data: [1200, 980, ...] }

// total order count, all time
const total = await Metrics.query(orderRepo.createQueryBuilder('orders'))
  .count()
  .byYear()
  .metrics(); // → number
```

### From a repository

```ts
import { metricsFor, withMetrics } from 'nestjs-metrics';

await metricsFor(orderRepo).sum('amount').byMonth().trends();

// or extend the repository with a .metrics() method
const repo = withMetrics(orderRepo);
await repo.metrics().countByMonth().trends();
```

### NestJS module

```ts
import { MetricsModule, MetricsService } from 'nestjs-metrics/nestjs';

@Module({
  imports: [MetricsModule.forRoot({ locale: 'pt-BR', timezone: 'America/Sao_Paulo' })],
})
export class AppModule {}

@Injectable()
export class DashboardService {
  constructor(
    private readonly metrics: MetricsService,
    @InjectRepository(Order) private readonly orders: Repository<Order>,
  ) {}

  monthlyRevenue() {
    return this.metrics
      .query(this.orders.createQueryBuilder('orders'))
      .sumByMonth('amount', 12)
      .forYear(2026)
      .fillMissingData()
      .trends();
  }
}
```

`MetricsModule.forFeature({ locale, timezone })` overrides the root defaults
within a feature module. Configuration precedence is
**call option > forFeature > forRoot > library default** (`en` / `UTC`).

## API

### Aggregates

```ts
.count(column = 'id')
.sum(column)
.average(column)
.max(column)
.min(column)
```

### Periods

```ts
.byDay(count = 0)
.byWeek(count = 0)
.byMonth(count = 0)
.byYear(count = 0)
```

`count = 0` → the whole period · `count = 1` → a single unit · `count > 1` → the
last-`n` window.

### Reference point

```ts
.forDay(day)
.forWeek(week)   // ISO week number
.forMonth(month)
.forYear(year)
```

### Date ranges

```ts
.between(start, end)     // 'YYYY-MM-DD'
.from(date)              // between date and today
.groupByDay() | .groupByWeek() | .groupByMonth() | .groupByYear()  // range granularity
```

### Targeting

```ts
.dateColumn(column)   // bucket by a column other than created_at
.table(name)          // qualify columns against a joined table
.labelColumn(column)  // group the series by a categorical column
```

### Outputs

```ts
.metrics()                                  // → number
.trends(inPercent = false)                  // → { labels, data }
.metricsWithVariations(prevCount, prevPeriod, inPercent = false)
//   → { count, variation: { type: 'none' | 'increase' | 'decrease', value } }
```

### Modifiers

```ts
.fillMissingData(value = 0, labels = [])    // fill gaps in a trend series
.groupData(labels, aggregate = Aggregate.SUM)
//   trends() → { labels, data: { total, [label]: [] } }   (stacked / multi-series)
```

### Combined shorthands

Every aggregate combines with every period and range:

```ts
.countByMonth(column?, count?)   .sumByYear(column, count?)   .averageByWeek(column, count?)
.maxByDay(column, count?)        .minByYear(column, count?)   // ...all 20 by-period shorthands
.countBetween([start, end], column?)   .sumBetween([start, end], column)   // ...all 5 *Between
.countFrom(date, column?)              .sumFrom(date, column)              // ...all 5 *From
```

### Locale & timezone

```ts
Metrics.query(qb, { locale: 'pt-BR', timezone: 'America/Sao_Paulo' });
```

Month and day labels are translated via the locale (default `en`). With a
non-UTC `timezone`, the date column is converted before bucketing so
near-midnight rows land on the correct local day (DST-correct).

> **MySQL:** `CONVERT_TZ` needs the named timezone tables loaded
> (`mysql_tzinfo_to_sql /usr/share/zoneinfo | mysql mysql`), or it returns NULL.

### Errors

Typed exceptions: `InvalidAggregateException`, `InvalidPeriodException`,
`InvalidDateFormatException`, `InvalidVariationsCountException`,
`InvalidIdentifierException`, `InvalidTimezoneException`. Column/table
identifiers are validated and driver-escaped — but keep them
developer-controlled, not user input.

## Development

Everything runs in Docker:

```bash
docker compose run --rm dev npm install
docker compose run --rm dev npm test            # SQLite
docker compose up -d --wait postgres mysql
docker compose run --rm -e PG_HOST=postgres -e MYSQL_HOST=mysql dev npm test
```

## License

[MIT](./LICENSE)
