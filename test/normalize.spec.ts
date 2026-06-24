import { describe, expect, it } from 'vitest';
import { normalizeData, normalizeLabel } from '../src/formatting/normalize';

/**
 * The executor mode runs raw SQL through Prisma/Drizzle/pg drivers, which each
 * return the same value as a different JS type: COUNT as BigInt (Prisma), a sum
 * as a Decimal-like object (Prisma), numerics as strings (node-postgres). These
 * coercions are the single boundary that hands clean number/label values to the
 * shared formatter.
 */
describe('normalizeData', () => {
  it('passes plain numbers through', () => {
    expect(normalizeData(42)).toBe(42);
    expect(normalizeData(3.5)).toBe(3.5);
  });

  it('coerces BigInt counts to number', () => {
    expect(normalizeData(690n)).toBe(690);
  });

  it('coerces numeric strings (node-postgres) to number', () => {
    expect(normalizeData('690')).toBe(690);
    expect(normalizeData('173876.44')).toBe(173876.44);
  });

  it('coerces Decimal-like objects via toString', () => {
    const decimal = { toString: () => '1234.56' };
    expect(normalizeData(decimal)).toBe(1234.56);
  });

  it('treats null/undefined as 0', () => {
    expect(normalizeData(null)).toBe(0);
    expect(normalizeData(undefined)).toBe(0);
  });
});

describe('normalizeLabel', () => {
  it('keeps non-numeric string labels (categorical, date buckets)', () => {
    expect(normalizeLabel('paid')).toBe('paid');
    expect(normalizeLabel('2026-01')).toBe('2026-01');
  });

  it('coerces integer period parts to number (pg EXTRACT returns strings)', () => {
    expect(normalizeLabel('1')).toBe(1);
    expect(normalizeLabel('2026')).toBe(2026);
  });

  it('coerces BigInt period parts to number', () => {
    expect(normalizeLabel(3n)).toBe(3);
  });

  it('keeps plain number labels', () => {
    expect(normalizeLabel(7)).toBe(7);
  });

  it('coerces a Date label to a stable YYYY-MM-DD string', () => {
    expect(normalizeLabel(new Date('2026-01-15T00:00:00Z'))).toBe('2026-01-15');
  });
});
