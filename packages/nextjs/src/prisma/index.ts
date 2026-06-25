import {
  MetricsBuilder,
  type ExecutorSpec,
  type MetricsOptions,
  type Row,
  type SupportedDialect,
} from '@pedropcardoso/metrics-core';

/**
 * The slice of a PrismaClient we use: `$queryRawUnsafe` runs a parameterized SQL
 * string. Duck-typed so this package never imports `@prisma/client` (it stays an
 * optional peer; users pass their own generated client).
 */
export interface PrismaClientLike {
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
}

export interface PrismaMetricsSpec extends ExecutorSpec {
  /** Prisma cannot report its provider at runtime — state it explicitly. */
  dialect: SupportedDialect;
}

/**
 * Build a metrics query over a Prisma client. The emitted SQL runs through
 * `$queryRawUnsafe`; values are bound positionally by the core executor.
 */
export function prismaMetrics(
  prisma: PrismaClientLike,
  spec: PrismaMetricsSpec,
  options?: MetricsOptions,
): MetricsBuilder<Record<string, unknown>> {
  const { dialect, ...source } = spec;
  return MetricsBuilder.queryExecutor<Record<string, unknown>>(
    {
      dialect,
      execute: (sql, params) => prisma.$queryRawUnsafe<Row[]>(sql, ...params),
    },
    source,
    options,
  );
}
