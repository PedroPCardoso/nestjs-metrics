import { ObjectLiteral, Repository } from 'typeorm';
import { MetricsBuilder } from './metrics.builder';
import { MetricsOptions } from './types';

/**
 * A pre-wired metrics builder from a repository. The query builder is aliased
 * by the entity's table name so column qualification works out of the box.
 */
export function metricsFor<T extends ObjectLiteral>(
  repo: Repository<T>,
  options?: MetricsOptions,
): MetricsBuilder<T> {
  return MetricsBuilder.query(repo.createQueryBuilder(repo.metadata.tableName), options);
}

export interface MetricsRepository<T extends ObjectLiteral> extends Repository<T> {
  metrics(options?: MetricsOptions): MetricsBuilder<T>;
}

/**
 * Extend a repository with a `.metrics()` method, for a repository-centric
 * entry point: `withMetrics(orderRepo).metrics().sumByMonth('amount')`.
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
