# nestjs-metrics — Architecture, Implementation & Delivery

> Port of [`eliseekn/laravel-metrics`](https://github.com/eliseekn/laravel-metrics) to the **NestJS + TypeScript** ecosystem, shipped as an **npm library** with a **pluggable NestJS module**.

---

## 0. Review session (grilling) decisions

> **These decisions take precedence over the rest of the document wherever there is conflict.** They result from an architecture stress-test session.

| # | Decision | Summary rationale |
|---|---|---|
| 1 | **Cut `QueryAdapter` from v0.1.** Couple the core directly to TypeORM's `SelectQueryBuilder`. | Speculative abstraction with 1 implementation; extract only when the 2nd ORM exists. The `SqlDialect` strategy remains (3 dialects coexist from day 1). |
| 2 | **Validate identifiers:** `assertSafeIdentifier()` (allowlist regex) + driver escape in `column`/`table`/`dateColumn`/`labelColumn`. | Public library; named parameters do not protect identifiers. Closes the SQL injection vector inherited from the original. |
| 3 | **Idiomatic port, parity as baseline (not dogma).** Defensible quirks are fixed and recorded in `DIVERGENCES.md`. DoD = "output parity **except documented divergences**". | Allows fixing latent bugs in the original (week, date heuristic, `groupData` ordering). |
| 4 | **Week = uniform ISO-8601** via SQL per dialect, with cross-dialect test. | Original is inconsistent (`Carbon::week` in PHP vs `%W`/`WEEK()`/`EXTRACT` in SQL). ISO is the analytics standard. |
| 5 | **Keep all 3 usage forms** (`Metrics.query`, `MetricsService`+module, `metricsFor(repo)`) as thin facades over **a single core**; smoke tests per facade. | Explicit user request. Single core avoids behavior divergence. |
| 6 | **Real multi-dialect tests (Testcontainers Postgres+MySQL) block every PR**, plus SQLite + SQL snapshots. | Hard guarantee of real execution from v0.1. |
| 7 | **CJS-first distribution** (`"type": "commonjs"`) + type declarations. Dual/ESM for a future major. | Nest/TypeORM ecosystem is CJS; avoids dual-package hazard in enums/exceptions. |
| 8 | **Entity shortcut = `metricsFor(repo)`** (canonical) + optional `Repository` extension. **Drop** the literal Active Record `Entity.metrics()`. | TypeORM is Data Mapper; syntactic clone would require tying to a global connection and Active Record. Parity is semantic, not syntactic. |
| 9 | **Timezone-aware bucketing from v0.1**: `timezone` option with timezone conversion in SQL per dialect. | Date grouping is silently dependent on the connection's timezone; user requirement. |
| 10 | **SQLite does TZ-aware bucketing in JS (Luxon, DST-correct)**; Postgres/MySQL in SQL. MySQL container setup **loads timezone tables**. | SQLite has no native TZ; the JS path becomes the DST-correct oracle that validates the SQL of the other two. `CONVERT_TZ` without tables silently returns NULL. |
| 11 | **Global config via `forRoot({ locale?, timezone? })`** + **`forFeature({ locale?, timezone? })`** as per-scope override. Precedence: **call option > forRoot > lib default** (`en` / `UTC`). | Decisions 9/10 created 2 legitimate global defaults; the module is no longer ceremony. |

---

## 1. Objective

Recreate, in NestJS/TypeScript, a library that generates **metrics** (aggregate values) and **trends** (time series for charts) from database entities, through a **fluent API** equivalent to `laravel-metrics`.

The result must:

- Be publishable on **npm** and importable as a **NestJS module** (`MetricsModule`) and/or standalone class (`Metrics`).
- Support **PostgreSQL, MySQL/MariaDB and SQLite** (same dialects as the original).
- Use **TypeORM** as the data access layer (equivalent of Eloquent/Query Builder).
- Maintain **functional and output format parity** with the original, validated by tests.

### Non-goals (v1)

- Not an HTTP app/service — it's a lib (a demo app is in the roadmap, see §13).
- Does not provide a chart UI; delivers only the **payload** (`{ labels, data }`) ready for Chart.js/ApexCharts/etc.
- ~~Does not support Prisma/Knex/Drizzle in v1.~~ **(Decision 1, updated):** the abstraction was **extracted** when the 2nd backend emerged (executor mode, see §6.4). The core is now dual-mode — the TypeORM path remains intact; an ORM-agnostic `ExecutorBackend` emits raw SQL to any `DataSource` `(sql, params) => rows`. The engine lives in `nestjs-metrics-core`; `nestjs-metrics` (NestJS) and `nextjs-metrics` (Prisma/Drizzle) depend on it (PRD #16).

---

## 2. Analysis of the original project

`laravel-metrics` is a **library** (not an app). Core ~1,200 lines:

| File | Responsibility |
|---|---|
| `src/LaravelMetrics.php` (874 ln) | Fluent builder: aggregates, periods, `metrics()`, `trends()`, `metricsWithVariations()`, grouped data, fill missing |
| `src/DatesFunctions.php` (252 ln) | **SQL per dialect** (day/week/month/year extraction), period window calculation, date label generation, locale translation (Carbon) |
| `src/Enums/Aggregate.php` | `count`/`avg`/`sum`/`max`/`min` |
| `src/Enums/Period.php` | `today`/`day`/`week`/`month`/`year` |
| `src/HasMetrics.php` | Trait `Order::metrics()` (shortcut from the model) |
| `src/LaravelMetricsFacade.php` | Laravel Facade |
| `src/Exceptions/*` | 4 validation exceptions (period, aggregate, date format, variation count) |

### 2.1 API surface (to replicate)

**Builder entry points**
- `query(builder)` — from a Query/Eloquent builder.
- `Order::metrics()` — shortcut via trait.
- `table(name)`, `dateColumn(col)` (default `created_at`), `labelColumn(col)`.

**Aggregates** — `count(col='id')`, `average(col)`, `sum(col)`, `max(col)`, `min(col)`.

**Periods**
- `byDay(n)`, `byWeek(n)`, `byMonth(n)`, `byYear(n)` — `n=0` → current period; `n=1` → single point; `n>1` → window.
- `between(start, end, isoFormat)`, `from(date, isoFormat)`.
- `forDay/forWeek/forMonth/forYear(value)` — fixes the reference point.
- `groupByDay/Week/Month/Year()` — granularity (only with `between`).

**Combinations** — `countByMonth`, `sumByYear`, `averageBetween`, `maxFrom`, … (cartesian product aggregate × period).

**Outputs**
- `metrics(): number` — single aggregate value.
- `trends(inPercent=false): { labels: string[], data: number[] }` — chart-ready series.
- `metricsWithVariations(prevCount, prevPeriod, inPercent): { count, variation: { type, value } }`.

**Output modifiers**
- `fillMissingData(value=0, labels=[])` — fills gaps in the series (auto-discovers labels).
- `groupData(labels[], aggregate)` — breaks a categorical column into multiple datasets (`{ labels, data: { total, <label>: [] } }`).
- `trends(true)` — converts series to percentages.

**Locale** — day/month names translated via `app.locale` (Carbon). Week becomes `Week N`.

### 2.2 The sensitive point: SQL per dialect

`formatPeriod()` and `formatDateColumn()` emit **different SQL per driver**:

| Concept | MySQL | PostgreSQL | SQLite |
|---|---|---|---|
| day | `day(col)` | `EXTRACT(DAY FROM col)` | `CAST(strftime('%d', col) AS INTEGER)` |
| week | `week(col)` | `EXTRACT(WEEK FROM col)` | `CAST(strftime('%W', col) AS INTEGER)` |
| month | `month(col)` | `EXTRACT(MONTH FROM col)` | `CAST(strftime('%m', col) AS INTEGER)` |
| year | `year(col)` | `EXTRACT(YEAR FROM col)` | `CAST(strftime('%Y', col) AS INTEGER)` |
| date | `date(col)` | `TO_CHAR(col,'YYYY-MM-DD')` | `strftime('%Y-%m-%d', col)` |

This is the heart of portability: it must be an isolated and thoroughly tested **per-dialect strategy**.

---

## 3. Architectural decisions

| Decision | Choice | Justification |
|---|---|---|
| Language | TypeScript 5.x (strict) | Fluent API typing |
| Target framework | NestJS 10+ | Injectable `forRoot/forFeature` module |
| Data access | **TypeORM 0.3** (`DataSource`/`SelectQueryBuilder`) | Closest equivalent to Eloquent in Nest |
| Dates/locale | **Luxon** | Replaces Carbon: `DateTime`, intervals, `toLocaleString`, month/day names by locale |
| Tests | **Vitest** (or Jest) + **better-sqlite3** in-memory | Mirrors the original SQLite suite; real integration tests against Postgres/MySQL via Docker |
| Build | **tsup** (CJS+d.ts) or `tsc` | Single format, types published |
| Lint/format | ESLint + Prettier | Equivalent to Pint |
| Versioning | SemVer + **Changesets** | Automates changelog and publish |
| CI/CD | GitHub Actions | Dialect matrix + npm publish |

### Concept equivalences

| Laravel | nestjs-metrics |
|---|---|
| Eloquent `Builder` / Query `Builder` | TypeORM `SelectQueryBuilder<T>` |
| `Carbon` | `luxon.DateTime` |
| `config('app.locale')` | `locale` option on module / parameter |
| Trait `HasMetrics` | Mixin/decorator `withMetrics()` or static method on repository |
| Facade | Injectable provider `MetricsService` |
| PHP Enum | `enum`/`as const` TS |
| Exceptions | Classes extending Nest `BadRequestException`/custom |

---

## 4. Package architecture

### 4.1 Layers

```
┌─────────────────────────────────────────────────────────┐
│  Public API (fluent)                                     │
│  Metrics.query(qb) ─► .sum('amount').byMonth().trends()  │
├─────────────────────────────────────────────────────────┤
│  Core                                                     │
│  • MetricsBuilder   (fluent state + orchestration)        │
│  • AggregateRunner  (builds SELECT, executes, normalizes) │
│  • TrendsFormatter  (labels/data, percent, fill, group)   │
│  • VariationsCalc   (metricsWithVariations)               │
├─────────────────────────────────────────────────────────┤
│  Dialect Strategy        │  Date/Locale Service           │
│  • PostgresDialect       │  • PeriodResolver (windows)    │
│  • MySqlDialect          │  • LabelFormatter (luxon)      │
│  • SqliteDialect         │  • PeriodSeriesGenerator       │
│  (interface SqlDialect)  │    (missing dates)             │
├─────────────────────────────────────────────────────────┤
│  Data Adapter                                            │
│  • TypeOrmAdapter (SelectQueryBuilder, driver detect)     │
│  (interface QueryAdapter ─ ports for future ORMs)         │
├─────────────────────────────────────────────────────────┤
│  NestJS Integration                                      │
│  • MetricsModule.forRoot({ dataSource, locale })          │
│  • MetricsService (injectable provider)                   │
└─────────────────────────────────────────────────────────┘
```

### 4.2 Core components

- **`MetricsBuilder`** — holds fluent state (period, aggregate, column, label, count, year/month/day/week, fill/group flags). Each method `byMonth()/sum()/...` returns `this`. It is **immutable-friendly**: `clone()` for `metricsWithVariations`.
- **`SqlDialect` (interface)** — `periodExpr(part, col)`, `dateExpr(col)`, `weekOfYear()`, etc. Implementations per driver. Selected via `adapter.getDriver()`.
- **`QueryAdapter` (interface)** — abstracts the ORM: `clone()`, `selectRaw(expr, bindings)`, `whereYear/Month/Between`, `groupBy`, `get()/first()`, `getDriver()`, `getTable()`. `TypeOrmAdapter` is the only impl in v1.
- **`PeriodResolver`** — port of `getDayPeriod/getWeekPeriod/getMonthPeriod` (window calculation `[start, end]`).
- **`LabelFormatter`** — port of `formatDate`/`formatPeriod` for readable labels (Luxon + locale).
- **`PeriodSeriesGenerator`** — port of `getMonthsData/getDaysData/...` for `fillMissingData`.
- **`TrendsFormatter`** — port of `formatTrends`, `populateMissingData*`, `trendsWithMergedData`.

### 4.3 Folder structure

```
nestjs-metrics/
├─ src/
│  ├─ index.ts                    # public barrel exports
│  ├─ metrics.builder.ts          # MetricsBuilder (fluent core)
│  ├─ metrics.module.ts           # NestJS MetricsModule.forRoot/forFeature
│  ├─ metrics.service.ts          # injectable provider
│  ├─ enums/
│  │  ├─ aggregate.enum.ts
│  │  └─ period.enum.ts
│  ├─ dialects/
│  │  ├─ sql-dialect.interface.ts
│  │  ├─ postgres.dialect.ts
│  │  ├─ mysql.dialect.ts
│  │  ├─ sqlite.dialect.ts
│  │  └─ dialect.factory.ts
│  ├─ adapters/
│  │  ├─ query-adapter.interface.ts
│  │  └─ typeorm.adapter.ts
│  ├─ dates/
│  │  ├─ period-resolver.ts
│  │  ├─ label-formatter.ts
│  │  └─ period-series.generator.ts
│  ├─ formatting/
│  │  ├─ trends.formatter.ts
│  │  └─ variations.calculator.ts
│  ├─ exceptions/
│  │  ├─ invalid-aggregate.exception.ts
│  │  ├─ invalid-period.exception.ts
│  │  ├─ invalid-date-format.exception.ts
│  │  └─ invalid-variations-count.exception.ts
│  └─ types.ts                    # TrendsResult, MetricsResult, options
├─ test/
│  ├─ helpers/datasource.ts       # sqlite :memory: + seed orders
│  ├─ metrics.spec.ts
│  ├─ trends.spec.ts
│  ├─ variations.spec.ts
│  ├─ fill-missing.spec.ts
│  ├─ group-data.spec.ts
│  ├─ dialects.spec.ts            # Postgres/MySQL integration (Docker)
│  └─ exceptions.spec.ts
├─ docs/ARCHITECTURE.md
├─ package.json
├─ tsconfig.json / tsconfig.build.json
├─ tsup.config.ts
├─ vitest.config.ts
├─ .eslintrc / .prettierrc
├─ .changeset/
└─ .github/workflows/{ci.yml,release.yml}
```

---

## 5. Public API design

### 5.1 Standalone (mirrors `LaravelMetrics::query`)

```ts
import { Metrics } from 'nestjs-metrics';

// amount sum trend by month for the current year
const result = Metrics
  .query(orderRepo.createQueryBuilder('orders'))
  .sum('amount')
  .byMonth(6)
  .trends();
// => { labels: ['January', ...], data: [1200, ...] }

const total = Metrics
  .query(orderRepo.createQueryBuilder('orders'))
  .sum('amount')
  .byYear()
  .metrics(); // => number
```

> Since TypeORM is async, terminal methods return `Promise`: `await ...trends()`, `await ...metrics()`. This is the main difference vs. synchronous PHP.

### 5.2 Via NestJS module + service

```ts
@Module({
  imports: [
    MetricsModule.forRoot({ dataSource, locale: 'pt-BR' }),
  ],
})
export class AppModule {}

@Injectable()
class DashboardService {
  constructor(private readonly metrics: MetricsService) {}

  monthlyRevenue() {
    return this.metrics
      .query(this.orderRepo.createQueryBuilder('orders'))
      .sumByMonth('amount', 12)
      .forYear(2026)
      .fillMissingData()
      .trends();
  }
}
```

### 5.3 Shortcut from the entity (equivalent to the trait)

```ts
// helper that injects .metrics() into the repository
const builder = metricsFor(orderRepo); // Pre-configured QueryBuilder
await builder.countByMonth().trends();
```

### 5.4 Return types

```ts
type TrendsResult = { labels: (string | number)[]; data: number[] };
type GroupedTrendsResult = {
  labels: (string | number)[];
  data: { total: number[]; [group: string]: number[] };
};
// Normalized discriminated shape (see DIVERGENCES.md §6).
type VariationResult = {
  count: number;
  variation: { type: 'none' | 'increase' | 'decrease'; value: number | string };
};
```

---

## 6. Portability details (technical risks)

### 6.1 Synchronous → asynchronous
PHP executes queries inline. In TypeORM, `getRawOne/getRawMany` are `async`. **Decision:** only terminal methods (`metrics`, `trends`, `metricsWithVariations`) are `async`; the entire fluent builder remains synchronous and chainable.

### 6.2 `selectRaw` + bindings
The original uses `selectRaw('avg(col) as data, ...')` and positional bindings (`?`) in `groupData`. TypeORM uses `addSelect(expr, alias)` + named parameters (`:p0`). `TypeOrmAdapter` translates positional `?` → generated named parameters.

### 6.3 Driver detection
`builder.getConnection().getDriverName()` → `dataSource.options.type` (`postgres`/`mysql`/`mariadb`/`sqlite`/`better-sqlite3`). `DialectFactory.for(type)` returns the correct strategy; `mariadb` maps to `MySqlDialect`.

### 6.4 ORM abstraction — **extracted (Decision 1, fulfilled)**
The interface was extracted when the 2nd backend emerged, not designed speculatively. The core is **dual-mode** behind `QueryBackend`: the builder assembles a backend-neutral `QueryPlan` (select/where/group/order + `:name` params), and a backend renders it:
- **`TypeOrmBackend`** — the original path, over `SelectQueryBuilder`, with driver behavior and escaping **unchanged**.
- **`ExecutorBackend`** — assembles raw parameterized SQL and executes it via an agnostic `DataSource` `(sql, params) => rows` (Prisma/Drizzle/any driver). `:name` placeholders become positional (`$n` in Postgres, `?` in MySQL/SQLite); raw driver types go through `normalize()` at the boundary.

The `SqlDialect` strategy has existed since day 1 (the three dialects coexist) and gained `escapeId`/`placeholder` for executor mode.

### 6.7 Identifier safety (Decision 2)
`column`/`table`/`dateColumn`/`labelColumn` are interpolated raw into SQL (inherited from the original). Since this is a public library and named parameters do **not** protect identifiers, every identifier goes through `assertSafeIdentifier()` (allowlist `^[a-zA-Z_][a-zA-Z0-9_.]*$`) + escape (driver in `TypeOrmBackend`, `dialect.escapeId` in `ExecutorBackend`) before entering SQL. Values flow **only** as bound parameters. The ideal is still dev-controlled input.

**Escape hatch `from` (executor mode):** `ExecutorSpec.from` accepts a raw `FROM` fragment (for joins/subqueries that structured `{ table }` cannot express). This fragment is interpolated **without** sanitization — it is a **trusted dev surface**, explicitly not for end-user input. This is the only point outside the allowlist rule above, noted here on purpose.

### 6.8 Timezone (Decisions 9 and 10)
`timezone` option (IANA) on call/`forRoot`/`forFeature`. Conversion per dialect: Postgres `col AT TIME ZONE`, MySQL `CONVERT_TZ()` (**requires timezone tables loaded** in the container — otherwise silently returns NULL), SQLite **does bucketing in JS** (Luxon, DST-correct), which serves as oracle to validate the SQL of the other two. Default `UTC`.

### 6.5 Locale / date names
Carbon `->locale(x)->monthName` → Luxon `DateTime.fromObject({...},{locale}).toLocaleString({ month: 'long' })`. Cover name parity in `en` and `pt-BR` with test snapshots. Watch for week numbering differences (ISO vs. Carbon `%W`).

### 6.6 Decimals
SQLite/Postgres may return aggregates as strings. Normalize via `Number()`/`parseFloat` in `AggregateRunner`, like PHP's `(float)` cast.

---

## 7. Implementation plan

**TDD** approach (red-green-refactor), porting the original test suite as **executable spec** — each PHP test becomes a Vitest test, ensuring observable parity.

### Phase 0 — Bootstrap (0.5 day)
- `package.json`, `tsconfig` strict, ESLint/Prettier, tsup, Vitest.
- Test helper: in-memory SQLite `DataSource` + `orders` table (`id, status, amount, created_at, updated_at`) and seed — mirrors `tests/TestCase.php`.
- Minimal CI (lint + test) green.

### Phase 1 — Core: metrics() on SQLite (1.5 days)
- `enums`, `exceptions`, `QueryAdapter` + `TypeOrmAdapter`, `SqliteDialect`.
- `MetricsBuilder` with aggregates + `byDay/Week/Month/Year` + `metrics()`.
- Port `MetricsTest.php`. **Output:** correct `metrics()` for all aggregates/periods on SQLite.

### Phase 2 — trends() + labels/locale (2 days)
- `LabelFormatter` (Luxon), `TrendsFormatter`, `PeriodResolver`.
- `trends()`, `trends(true)` (percent), `labelColumn`, `dateColumn`, `between`/`from`, `forX`.
- Port `TrendsTest.php`. **Output:** trends with translated month/day names.

### Phase 3 — fillMissingData + groupData + groupBy (2 days)
- `PeriodSeriesGenerator`, `populateMissingData*`, `trendsWithMergedData`, `groupBy*`.
- Port `FillMissingDataTest.php` and `GroupDataTest.php`.

### Phase 4 — metricsWithVariations + exceptions (1 day)
- `VariationsCalculator`, `clone()` on builder, validations.
- Port `MetricsWithVariationsTest.php` and `ExceptionsTest.php`.

### Phase 5 — Multi-dialect (1.5 days)
- `PostgresDialect`, `MySqlDialect`, `DialectFactory`.
- `test/dialects.spec.ts` running against real Postgres and MySQL via **Testcontainers/docker-compose** in CI (matrix).

### Phase 6 — NestJS integration (1 day)
- `MetricsModule.forRoot/forFeature`, `MetricsService`, helper `metricsFor(repo)`.
- Integration test: `Test.createTestingModule` resolving `MetricsService`.

### Phase 7 — DX, docs and examples (1 day)
- README with the same example structure as the original (combinations table).
- JSDoc/TSDoc on public API, `examples/` with Chart.js payload.

**Total estimate:** ~10.5 business days (1 dev).

### 7.1 Definition of Done
- All ported tests pass (output parity with the original in `en`).
- Green CI matrix on SQLite + Postgres + MySQL.
- ≥ 85% coverage on core (`dialects`, `dates`, `formatting`).
- `npm pack` produces d.ts; `tsc --noEmit` clean on consumer project.
- README + CHANGELOG + examples.

---

## 8. Testing strategy

| Layer | Type | Tool |
|---|---|---|
| Builder/formatters | Unit | Vitest (pure, no DB) |
| metrics/trends/fill/group | Light integration | Vitest + SQLite `:memory:` |
| Postgres/MySQL dialects | Real integration | Testcontainers / docker-compose |
| NestJS module | Integration | `@nestjs/testing` |
| SQL parity | Snapshot | SQL string snapshot per dialect |
| Locale | Snapshot | `en` + `pt-BR` |

**Principle:** each PHP `tests/` test has a mirror. Intentional divergences (e.g., async) are documented at the top of the spec file.

---

## 9. Packaging and build

`package.json` (essential):

```jsonc
{
  "name": "nestjs-metrics",
  "version": "0.1.0",
  "type": "commonjs",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": { "require": "./dist/index.js", "types": "./dist/index.d.ts" }
  },
  "files": ["dist"],
  "peerDependencies": {
    "@nestjs/common": "^10 || ^11",
    "typeorm": "^0.3"
  },
  "dependencies": { "luxon": "^3" },
  "sideEffects": false
}
```

- **peerDependencies** for Nest/TypeORM (don't duplicate the consumer's instance).
- **CJS-first build + types** via **tsup** (Decision 7): single format, no dual-package hazard in enums/exceptions. Promotion to dual/ESM for a future major.
- `prepublishOnly`: `lint && test && build`.

---

## 10. CI/CD and publishing

### 10.1 `ci.yml` (PR and push)
- Matrix: Node 18/20/22 × dialect {sqlite, postgres(service), mysql(service)}.
- Steps: install → lint → typecheck → test (with DB containers) → build → `npm pack --dry-run`.

### 10.2 `release.yml` (publishing)
- **Changesets**: PRs include a changeset; merge to `main` opens/updates the "Version Packages" PR.
- When the version PR is merged: `changeset publish` → publishes to **npm** (token `NPM_TOKEN`) and creates tag/GitHub Release with changelog.
- Provenance: `npm publish --provenance` (supply-chain).

```yaml
# release.yml (summary)
on: { push: { branches: [main] } }
jobs:
  release:
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - run: pnpm install --frozen-lockfile
      - run: pnpm build
      - uses: changesets/action@v1
        with: { publish: pnpm release }   # = changeset publish
        env: { NPM_TOKEN: ${{ secrets.NPM_TOKEN }}, GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }} }
```

### 10.3 Versioning
- **SemVer.** v0.x while the API stabilizes; `1.0.0` when full parity + validated dialects is reached.
- `main` branch protected; releases only via changeset PR.

### 10.4 First publishing checklist
1. Reserve the name `nestjs-metrics` on npm (`npm view nestjs-metrics`).
2. Configure `NPM_TOKEN` (automation) in the repo secrets.
3. `LICENSE` (MIT, like the original), `README`, initial `CHANGELOG`.
4. `npm publish --dry-run` locally to validate `files`/`exports`.
5. Tag `v0.1.0` + GitHub Release.

---

## 11. Risks and mitigation

| Risk | Impact | Mitigation |
|---|---|---|
| Subtle SQL differences between dialects (ISO week vs `%W`) | Incorrect trends | Real integration tests per dialect + SQL snapshots |
| Locale parity (month names) | Labels diverge from original | Snapshots in `en`/`pt-BR`; document source (Luxon ICU) |
| Async breaks expected ergonomics | DX | Document clearly; only terminals are `async` |
| Positional → named bindings (groupData) | Invalid SQL/injection | Adapter centralizes translation; injection tests |
| Tight coupling to TypeORM | Limits adoption | `QueryAdapter` isolates the ORM from v1 |
| Aggregates as strings (driver) | Wrong types | Central numeric normalization |

---

## 12. Parity map (traceability)

| Original (PHP) | Port (TS) | Phase |
|---|---|---|
| `LaravelMetrics::query` / aggregates / `byX` | `MetricsBuilder` | 1–2 |
| `DatesFunctions::formatPeriod/formatDateColumn` | `dialects/*` | 1,5 |
| `formatDate` / locale | `LabelFormatter` | 2 |
| `getXPeriod` (windows) | `PeriodResolver` | 2–3 |
| `getXData` (series) | `PeriodSeriesGenerator` | 3 |
| `formatTrends`/`populateMissingData*`/`trendsWithMergedData` | `TrendsFormatter` | 2–3 |
| `metricsWithVariations` | `VariationsCalculator` | 4 |
| `HasMetrics` trait | `metricsFor(repo)` | 6 |
| Facade | `MetricsService` | 6 |
| `Enums/Exceptions` | `enums/`, `exceptions/` | 1 |

---

## 13. Post-v1 roadmap

- **NestJS demo app** (pnpm/Nx monorepo) with REST dashboard endpoints — equivalent to `laravel-metrics-demo`.
- **Prisma** and **Knex/Drizzle** adapters — via **extraction** of the interface from 2 real cases (Decision 1), not pre-built.
- Optional query caching (`@nestjs/cache-manager`).
- ~~Timezone support~~ — **moved up to v0.1** (Decisions 9/10).
- Output helpers ready for Chart.js/ApexCharts/Recharts.

---

## 14. Executive summary

Faithful port of `laravel-metrics` as an **npm lib + NestJS module** on top of **TypeORM**, with **Luxon** for dates/locale and **dialect strategies** isolated and tested against real databases. Delivery guided by **TDD with the original suite as spec**, published via **Changesets + GitHub Actions** to npm. ~10.5 days for v0.1 with functional parity; `1.0.0` after multi-dialect validation and API stabilization.
