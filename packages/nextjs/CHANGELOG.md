# @metrics-kit/nextjs

## 0.2.0

### Minor Changes

- e4044a2: Restructure into the `@metrics-kit` monorepo. The metrics engine is extracted into
  `@metrics-kit/core` (ORM-agnostic, dual-mode: TypeORM query builder or a raw-SQL
  executor for Prisma/Drizzle/any driver). `@metrics-kit/nestjs` holds the NestJS
  module/service; `@metrics-kit/nextjs` adds Prisma and Drizzle adapters under
  isolated subpaths (`/prisma`, `/drizzle`) with optional peer deps. `nestjs-metrics`
  becomes a thin façade re-exporting `@metrics-kit/core` (`.`) and `@metrics-kit/nestjs`
  (`./nestjs`) — no public API change.

### Patch Changes

- Updated dependencies [e4044a2]
  - @metrics-kit/core@0.2.0
