export { MetricsBuilder, MetricsBuilder as Metrics } from './metrics.builder';
export { metricsFor, withMetrics } from './repository';
export type { MetricsRepository } from './repository';
export type { MetricsEntity } from './types/metrics-entity';
export type {
  DataSource,
  SqlExecutor,
  Row,
  SupportedDialect,
  ExecutorSpec,
} from './datasource';
export type { WhereInput, WhereCondition, RangeCondition, WhereScalar } from './where';
export { Aggregate } from './enums/aggregate.enum';
export { Period } from './enums/period.enum';
export type { SqlDialect, DatePart } from './dialects/sql-dialect.interface';
export type {
  TrendsResult,
  GroupedTrendsResult,
  VariationResult,
  MetricsOptions,
} from './types';
export type { MetricsModuleOptions } from './options.schema';
export {
  MetricsOptionsSchema,
  ExecutorSpecSchema,
  MetricsModuleOptionsSchema,
  ValidationError,
  validateMetricsOptions,
  validateExecutorSpec,
  validateMetricsModuleOptions,
} from './options.schema';
export { InvalidPeriodException } from './exceptions/invalid-period.exception';
export { InvalidVariationsCountException } from './exceptions/invalid-variations-count.exception';
export { InvalidAggregateException } from './exceptions/invalid-aggregate.exception';
export { InvalidDateFormatException } from './exceptions/invalid-date-format.exception';
export { InvalidIdentifierException } from './exceptions/invalid-identifier.exception';
export { InvalidTimezoneException } from './exceptions/invalid-timezone.exception';
export { SqliteTimezoneUnsupportedException } from './exceptions/sqlite-timezone-unsupported.exception';
