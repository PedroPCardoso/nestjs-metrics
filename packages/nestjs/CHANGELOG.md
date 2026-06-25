# @pedropcardoso/metrics-nestjs

## 0.2.0

### Minor Changes

- e4044a2: Restructure into the `@metrics-kit` monorepo. The metrics engine is extracted into
  `@pedropcardoso/metrics-core` (ORM-agnostic, dual-mode: TypeORM query builder or a raw-SQL
  executor for Prisma/Drizzle/any driver). `@pedropcardoso/metrics-nestjs` holds the NestJS
  module/service; `@pedropcardoso/metrics-nextjs` adds Prisma and Drizzle adapters under
  isolated subpaths (`/prisma`, `/drizzle`) with optional peer deps. `nestjs-metrics`
  becomes a thin façade re-exporting `@pedropcardoso/metrics-core` (`.`) and `@pedropcardoso/metrics-nestjs`
  (`./nestjs`) — no public API change.

### Patch Changes

- Updated dependencies [e4044a2]
  - @pedropcardoso/metrics-core@0.2.0
