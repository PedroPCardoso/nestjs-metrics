/**
 * A minimal contract for an entity that MetricsBuilder can query.
 * `ObjectLiteral` from TypeORM is `{[key: string]: any}` — too loose for
 * meaningful type-checking. This interface documents which fields the builder
 * actually requires, so TypeScript can flag missing columns at compile time.
 *
 * Entities that satisfy this contract don't need `extends ObjectLiteral`;
 * the builder's `T extends MetricsEntity` is equally or more constrained.
 */
export interface MetricsEntity {
  /** Row identity — the default column for count(). */
  id: number | string;

  /** The default date column for period bucketing. */
  created_at: Date | string;

  /** Catch-all for user-defined columns in the entity. */
  [key: string]: unknown;
}
