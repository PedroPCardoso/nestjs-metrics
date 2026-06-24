/** A projected column: a SQL expression aliased for read-back. */
export interface SelectItem {
  expr: string;
  alias: string;
}

/**
 * A backend-neutral description of the statement the builder wants to run. SQL
 * expressions use `:name` placeholders; their values live in `params`. Two
 * backends render it: the TypeORM backend onto a SelectQueryBuilder, the
 * executor backend into a raw parameterized SQL string.
 */
export interface QueryPlan {
  select: SelectItem[];
  /** WHERE fragments, ANDed together. May reference `:name` params. */
  where: string[];
  groupBy?: string;
  orderBy?: { expr: string; dir: 'ASC' | 'DESC' };
  distinct?: boolean;
  /** Every named parameter referenced by the select/where expressions. */
  params: Record<string, unknown>;
  /** The active non-UTC timezone, when one is configured (else undefined). */
  tz?: string;
}
