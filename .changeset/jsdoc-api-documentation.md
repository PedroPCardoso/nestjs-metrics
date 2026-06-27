---
"nestjs-metrics-core": patch
"nestjs-metrics": patch
"nextjs-metrics": patch
---

Add comprehensive JSDoc to the public API — the fluent `MetricsBuilder` (its
factories, aggregates, period/range/grouping methods and async terminals), the
repository and executor helpers, the exported enums and result types, the NestJS
module/service and the Prisma/Drizzle adapters. Comments document parameters,
return values, `@throws` and usage examples, and ship in the published `.d.ts`
so they surface in editors. Also adds a TypeDoc `docs:api` script that generates
an HTML API reference. Documentation-only; no runtime or signature changes.
