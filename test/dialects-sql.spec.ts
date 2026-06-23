import { describe, expect, it } from 'vitest';
import { Aggregate } from '../src/enums/aggregate.enum';
import { dialectFor } from '../src/dialects/dialect.factory';

/**
 * Structural guard: pin the SQL each dialect emits for the tracer query, so a
 * change to one dialect's fragments is caught without needing a live database.
 */
describe('SQL fragments per dialect', () => {
  const dateCol = 'orders.created_at';

  it('emits the aggregate call per dialect', () => {
    expect(dialectFor('better-sqlite3').aggregate(Aggregate.COUNT, 'orders.id')).toBe(
      'count(orders.id)',
    );
    expect(dialectFor('postgres').aggregate(Aggregate.COUNT, 'orders.id')).toBe(
      'count(orders.id)',
    );
    expect(dialectFor('mysql').aggregate(Aggregate.COUNT, 'orders.id')).toBe(
      'count(orders.id)',
    );
  });

  it('extracts the year per dialect', () => {
    expect(dialectFor('better-sqlite3').periodExpr('year', dateCol)).toBe(
      "CAST(strftime('%Y', orders.created_at) AS INTEGER)",
    );
    expect(dialectFor('postgres').periodExpr('year', dateCol)).toBe(
      'EXTRACT(YEAR FROM orders.created_at)',
    );
    expect(dialectFor('mysql').periodExpr('year', dateCol)).toBe('year(orders.created_at)');
  });

  it('maps mariadb to the MySQL dialect', () => {
    expect(dialectFor('mariadb').periodExpr('month', dateCol)).toBe(
      dialectFor('mysql').periodExpr('month', dateCol),
    );
  });

  it('throws for an unsupported driver', () => {
    expect(() => dialectFor('oracle')).toThrow(/unsupported database driver/);
  });
});
