# nestjs-metrics

## 0.2.0

### Minor Changes

- 7b6b2ad: Initial release: a fluent, chart-ready metrics & trends builder over TypeORM.

  - Aggregates (count/sum/average/max/min) and periods (day/week/month/year) for
    both `metrics()` and `trends()`, across SQLite, PostgreSQL and MySQL/MariaDB
  - ISO-8601 week numbering, period windows (`byX(0|1|n)`), reference pinning
    (`forX`), date ranges (`between`/`from`) with granularity, and the full set
    of combined shorthands
  - `fillMissingData`, `groupData` (multi-series + total), percentage trends,
    locale-translated labels (Luxon), and timezone-aware bucketing
  - `metricsWithVariations` with a normalized variation shape
  - Identifier validation + driver escaping; typed exceptions
  - NestJS integration via `nestjs-metrics/nestjs` (`MetricsModule.forRoot` /
    `forFeature`, `MetricsService`) plus `metricsFor(repo)` / `withMetrics(repo)`
