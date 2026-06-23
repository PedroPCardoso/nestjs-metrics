import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DataSource } from 'typeorm';
import {
  InvalidAggregateException,
  InvalidDateFormatException,
  InvalidIdentifierException,
  InvalidPeriodException,
  InvalidVariationsCountException,
  Metrics,
  Period,
} from '../src/index';
import { createOrdersDataSource, ordersQuery } from './helpers/orders-datasource';

describe('input validation & identifier safety', () => {
  let dataSource: DataSource;
  const m = () => Metrics.query(ordersQuery(dataSource));

  beforeAll(async () => {
    dataSource = await createOrdersDataSource();
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  describe('identifier allowlist', () => {
    it('rejects an injection via count() column', () => {
      expect(() => m().count('id; DROP TABLE orders')).toThrow(InvalidIdentifierException);
    });

    it('rejects an injection via dateColumn()', () => {
      expect(() => m().dateColumn('created_at) --')).toThrow(InvalidIdentifierException);
    });

    it('rejects an injection via labelColumn()', () => {
      expect(() => m().count().labelColumn('status OR 1=1')).toThrow(InvalidIdentifierException);
    });

    it('rejects an injection via table()', () => {
      expect(() => m().count().table('users; DROP TABLE orders')).toThrow(
        InvalidIdentifierException,
      );
    });

    it('accepts ordinary identifiers', () => {
      expect(() => m().sum('amount').dateColumn('updated_at').labelColumn('status')).not.toThrow();
    });
  });

  describe('typed exceptions', () => {
    it('throws InvalidDateFormatException for a malformed date', () => {
      expect(() => m().count().between('2026/01/01', '2026-01-31')).toThrow(
        InvalidDateFormatException,
      );
      expect(() => m().count().between('2026-13-45', '2026-01-31')).toThrow(
        InvalidDateFormatException,
      );
    });

    it('throws InvalidAggregateException for an unknown grouped aggregate', () => {
      expect(() => m().countByMonth('status').groupData(['pending'], 'bogus' as never)).toThrow(
        InvalidAggregateException,
      );
    });

    it('throws InvalidPeriodException for an unsupported variation period', async () => {
      await expect(
        m().count().byYear(1).metricsWithVariations(1, Period.TODAY),
      ).rejects.toThrow(InvalidPeriodException);
    });

    it('throws InvalidVariationsCountException for a non-positive count', async () => {
      await expect(
        m().count().byYear(1).metricsWithVariations(0, Period.YEAR),
      ).rejects.toThrow(InvalidVariationsCountException);
    });
  });
});
