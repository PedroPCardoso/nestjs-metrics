/** A bound value usable in a structured where condition. */
export type WhereScalar = string | number | boolean | null;

/** Range comparisons against a column. */
export interface RangeCondition {
  gte?: WhereScalar;
  lte?: WhereScalar;
  gt?: WhereScalar;
  lt?: WhereScalar;
}

/** Equality (scalar), membership (array → IN), or range (object). */
export type WhereCondition = WhereScalar | WhereScalar[] | RangeCondition;

/** Structured filter map: column → condition, ANDed together. */
export type WhereInput = Record<string, WhereCondition>;

export interface CompiledWhere {
  fragments: string[];
  params: Record<string, unknown>;
}

const RANGE_OPS: [keyof RangeCondition, string][] = [
  ['gte', '>='],
  ['lte', '<='],
  ['gt', '>'],
  ['lt', '<'],
];

/**
 * Compile a structured where map into SQL fragments + bound parameters. Column
 * names are qualified through `qualify` (which validates + escapes them — the
 * injection choke point); every value flows only as a `:param`.
 */
export function compileWhere(where: WhereInput, qualify: (column: string) => string): CompiledWhere {
  const fragments: string[] = [];
  const params: Record<string, unknown> = {};
  let next = 0;
  const bind = (value: unknown): string => {
    const key = `nm_w${next++}`;
    params[key] = value;
    return `:${key}`;
  };

  for (const [column, condition] of Object.entries(where)) {
    const col = qualify(column);

    if (condition === null) {
      fragments.push(`${col} IS NULL`);
    } else if (Array.isArray(condition)) {
      if (condition.length === 0) {
        fragments.push('1 = 0'); // empty IN () matches nothing
      } else {
        fragments.push(`${col} IN (${condition.map((value) => bind(value)).join(', ')})`);
      }
    } else if (isRange(condition)) {
      for (const [op, sql] of RANGE_OPS) {
        if (condition[op] !== undefined) {
          fragments.push(`${col} ${sql} ${bind(condition[op])}`);
        }
      }
    } else {
      fragments.push(`${col} = ${bind(condition)}`);
    }
  }

  return { fragments, params };
}

function isRange(condition: WhereCondition): condition is RangeCondition {
  return typeof condition === 'object' && condition !== null && !Array.isArray(condition);
}
