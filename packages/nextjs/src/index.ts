// Shared types for the Next.js / Node adapters. The ORM-specific entry points
// live under the isolated subpaths `@pedropcardoso/metrics-nextjs/prisma` and
// `@pedropcardoso/metrics-nextjs/drizzle`, so importing one never loads the other.
export type {
  SupportedDialect,
  ExecutorSpec,
  WhereInput,
  WhereCondition,
  RangeCondition,
  WhereScalar,
  MetricsOptions,
  TrendsResult,
  GroupedTrendsResult,
} from '@pedropcardoso/metrics-core';
