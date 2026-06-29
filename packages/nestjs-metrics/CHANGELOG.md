# nestjs-metrics

## 0.3.0

### Minor Changes

- 9bcdff7: Add contextual error handling. All errors now extend a shared `MetricsError` base
  class carrying a stable, machine-readable `code` and an optional structured
  `context`. Database failures are wrapped in a new `QueryExecutionError` that
  preserves the original error on `cause` and attaches the SQL, parameters and
  dialect that produced it. A new `ConfigurationError` (with an actionable
  `suggestion`) replaces the plain errors thrown for unsupported drivers and
  undetectable Drizzle dialects. The existing typed exceptions keep their names,
  messages and `instanceof Error` behaviour, so this is fully backward compatible.

### Patch Changes

- Updated dependencies [9bcdff7]
  - nestjs-metrics-core@0.2.0

## 0.2.5

### Patch Changes

- 86a4270: Add comprehensive JSDoc to the public API — the fluent `MetricsBuilder` (its
  factories, aggregates, period/range/grouping methods and async terminals), the
  repository and executor helpers, the exported enums and result types, the NestJS
  module/service and the Prisma/Drizzle adapters. Comments document parameters,
  return values, `@throws` and usage examples, and ship in the published `.d.ts`
  so they surface in editors. Also adds a TypeDoc `docs:api` script that generates
  an HTML API reference. Documentation-only; no runtime or signature changes.
- Updated dependencies [86a4270]
  - nestjs-metrics-core@0.1.1

## 0.2.2

### Patch Changes

- e4044a2: Restructure into the `@metrics-kit` monorepo. The metrics engine is extracted into
  `nestjs-metrics-core` (ORM-agnostic, dual-mode: TypeORM query builder or a raw-SQL
  executor for Prisma/Drizzle/any driver). `@pedropcardoso/metrics-nestjs` holds the NestJS
  module/service; `nextjs-metrics` adds Prisma and Drizzle adapters under
  isolated subpaths (`/prisma`, `/drizzle`) with optional peer deps. `nestjs-metrics`
  becomes a thin façade re-exporting `nestjs-metrics-core` (`.`) and `@pedropcardoso/metrics-nestjs`
  (`./nestjs`) — no public API change.
- Updated dependencies [e4044a2]
  - nestjs-metrics-core@0.2.0
  - @pedropcardoso/metrics-nestjs@0.2.0
