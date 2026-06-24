import { DataSource, Row } from '../datasource';
import { dialectFor } from '../dialects/dialect.factory';
import { SqlDialect } from '../dialects/sql-dialect.interface';
import { SqliteTimezoneUnsupportedException } from '../exceptions/sqlite-timezone-unsupported.exception';
import { normalizeData, normalizeLabel } from '../formatting/normalize';
import { QueryBackend } from './query-backend.interface';
import { QueryPlan } from './query-plan';

// A `:name` placeholder, but not the second `:` of a `::cast`.
const NAMED_PARAM = /(?<!:):([a-zA-Z_][a-zA-Z0-9_]*)/g;

/**
 * Renders a QueryPlan into a single parameterized SQL string and runs it through
 * the DataSource executor. Identifiers were already validated upstream
 * (assertSafeIdentifier); values flow only as positional bound parameters, so
 * the assembled SQL is injection-safe.
 */
export class ExecutorBackend implements QueryBackend {
  readonly dialect: SqlDialect;

  constructor(
    private readonly dataSource: DataSource,
    /** The FROM source: an escaped table name or a raw `from` fragment. */
    private readonly fromSql: string,
  ) {
    this.dialect = dialectFor(dataSource.dialect);
  }

  escapeId(name: string): string {
    return this.dialect.escapeId(name);
  }

  async run(plan: QueryPlan): Promise<Row[]> {
    if (plan.tz && this.dataSource.dialect === 'sqlite') {
      throw new SqliteTimezoneUnsupportedException(plan.tz);
    }
    const { sql, params } = this.assemble(plan);
    const rows = await this.dataSource.execute(sql, params);
    return rows.map((row) => this.normalizeRow(row));
  }

  private assemble(plan: QueryPlan): { sql: string; params: unknown[] } {
    const distinct = plan.distinct ? 'DISTINCT ' : '';
    const projection = plan.select
      .map((item) => `${item.expr} AS ${this.dialect.escapeId(item.alias)}`)
      .join(', ');

    let sql = `SELECT ${distinct}${projection} FROM ${this.fromSql}`;
    if (plan.where.length > 0) {
      sql += ` WHERE ${plan.where.join(' AND ')}`;
    }
    if (plan.groupBy) {
      sql += ` GROUP BY ${plan.groupBy}`;
    }
    if (plan.orderBy) {
      sql += ` ORDER BY ${plan.orderBy.expr} ${plan.orderBy.dir}`;
    }
    return this.bind(sql, plan.params);
  }

  /** Replace each `:name` with the dialect's positional placeholder, in order. */
  private bind(sql: string, named: Record<string, unknown>): { sql: string; params: unknown[] } {
    const params: unknown[] = [];
    const bound = sql.replace(NAMED_PARAM, (_match, name: string) => {
      if (!(name in named)) {
        throw new Error(`nestjs-metrics: missing bound parameter ":${name}"`);
      }
      params.push(named[name]);
      return this.dialect.placeholder(params.length);
    });
    return { sql: bound, params };
  }

  private normalizeRow(row: Row): Row {
    const out: Row = {};
    for (const [key, value] of Object.entries(row)) {
      out[key] = key === 'label' ? normalizeLabel(value) : normalizeData(value);
    }
    return out;
  }
}
