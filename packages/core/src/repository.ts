import type { ObjectLiteral, Repository } from 'typeorm';
import { MetricsBuilder } from './metrics.builder';
import { MetricsOptions } from './types';

/**
 * Build a pre-wired {@link MetricsBuilder} from a TypeORM repository. The query
 * builder is aliased by the entity's table name so column qualification works
 * out of the box.
 *
 * @param repo - The TypeORM repository to read from.
 * @param options - Locale, timezone and cache options for the query.
 * @returns A builder ready for chaining.
 *
 * @example
 * ```ts
 * const series = await metricsFor(orderRepo).sumByMonth('amount', 3).trends();
 * ```
 */
export function metricsFor<T extends ObjectLiteral>(
  repo: Repository<T>,
  options?: MetricsOptions,
): MetricsBuilder<T> {
  return MetricsBuilder.query(repo.createQueryBuilder(repo.metadata.tableName), options);
}

/**
 * A TypeORM `Repository` extended with a `.metrics()` method (the return type of
 * {@link withMetrics}).
 *
 * @typeParam T - The entity the repository manages.
 */
export interface MetricsRepository<T extends ObjectLiteral> extends Repository<T> {
  /** Open a {@link MetricsBuilder} pre-wired to this repository. */
  metrics(options?: MetricsOptions): MetricsBuilder<T>;
}

/**
 * Extend a repository with a `.metrics()` method, for a repository-centric
 * entry point: `withMetrics(orderRepo).metrics().sumByMonth('amount')`.
 *
 * @param repo - The TypeORM repository to extend.
 * @returns The same repository, typed as a {@link MetricsRepository}.
 *
 * @example
 * ```ts
 * const orders = withMetrics(orderRepo);
 * const total = await orders.metrics().sum('amount').metrics();
 * ```
 */
export function withMetrics<T extends ObjectLiteral>(
  repo: Repository<T>,
): MetricsRepository<T> {
  return repo.extend({
    metrics(this: Repository<T>, options?: MetricsOptions): MetricsBuilder<T> {
      return metricsFor(this, options);
    },
  }) as MetricsRepository<T>;
}
