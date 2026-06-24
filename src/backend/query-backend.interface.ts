import { Row } from '../datasource';
import { SqlDialect } from '../dialects/sql-dialect.interface';
import { QueryPlan } from './query-plan';

/**
 * Executes a QueryPlan against a concrete data layer. The builder assembles the
 * plan once (period filters, aggregates, labels); the backend renders it for
 * its driver and runs it. Implementations: TypeORM (SelectQueryBuilder) and the
 * raw-SQL executor (Prisma/Drizzle/…).
 */
export interface QueryBackend {
  readonly dialect: SqlDialect;
  /** Quote a pre-validated identifier for this backend. */
  escapeId(name: string): string;
  run(plan: QueryPlan): Promise<Row[]>;
}
