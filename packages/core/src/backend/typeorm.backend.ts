import type { ObjectLiteral, SelectQueryBuilder } from 'typeorm';
import { Row } from '../datasource';
import { registerSqliteTz, BetterSqlite3Db } from '../dates/sqlite-tz';
import { dialectFor } from '../dialects/dialect.factory';
import { SqlDialect } from '../dialects/sql-dialect.interface';
import { QueryBackend } from './query-backend.interface';
import { QueryPlan } from './query-plan';

/**
 * Renders a QueryPlan onto a cloned TypeORM SelectQueryBuilder, preserving the
 * driver's own identifier escaping and parameter binding. This is the original,
 * proven execution path — unchanged in behavior, now behind the backend seam.
 */
export class TypeOrmBackend<T extends ObjectLiteral> implements QueryBackend {
  readonly dialect: SqlDialect;

  constructor(private readonly qb: SelectQueryBuilder<T>) {
    this.dialect = dialectFor(qb.connection.options.type);
  }

  escapeId(name: string): string {
    return this.qb.connection.driver.escape(name);
  }

  async run(plan: QueryPlan): Promise<Row[]> {
    const q = this.qb.clone();
    plan.select.forEach((item, i) => {
      if (i === 0) {
        q.select(item.expr, item.alias);
      } else {
        q.addSelect(item.expr, item.alias);
      }
    });
    if (plan.distinct) {
      q.distinct(true);
    }
    for (const fragment of plan.where) {
      q.andWhere(fragment);
    }
    q.setParameters(plan.params);
    if (plan.groupBy) {
      q.groupBy(plan.groupBy);
    }
    if (plan.orderBy) {
      q.orderBy(plan.orderBy.expr, plan.orderBy.dir);
    }
    if (plan.tz) {
      this.registerTz();
    }
    return q.getRawMany<Row>();
  }

  /** Bind the SQLite tz user-function when bucketing in a non-UTC timezone. */
  private registerTz(): void {
    const driver = this.qb.connection.driver as { databaseConnection?: unknown };
    if (this.qb.connection.options.type === 'better-sqlite3' && driver.databaseConnection) {
      registerSqliteTz(driver.databaseConnection as BetterSqlite3Db);
    }
  }
}
