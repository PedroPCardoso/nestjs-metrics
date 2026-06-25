// The full engine + fluent API (re-exported from the core), plus the Prisma and
// Drizzle adapters. drizzle-orm is loaded lazily, so a Prisma-only user never
// needs it installed.
export * from 'nestjs-metrics-core';

export { prismaMetrics } from './prisma';
export type { PrismaClientLike, PrismaMetricsSpec } from './prisma';

export { drizzleMetrics } from './drizzle';
export type { DrizzleClientLike, DrizzleMetricsSpec } from './drizzle';
