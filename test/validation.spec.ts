import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DataSource } from 'typeorm';
import {
  ExecutorSpecSchema,
  InvalidAggregateException,
  InvalidDateFormatException,
  InvalidIdentifierException,
  InvalidPeriodException,
  InvalidVariationsCountException,
  Metrics,
  MetricsOptionsSchema,
  Period,
  ValidationError,
  validateExecutorSpec,
  validateMetricsModuleOptions,
  validateMetricsOptions,
} from 'nestjs-metrics-core';
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

  describe('schema validation (MetricsOptions)', () => {
    it('accepts valid options', () => {
      expect(() => validateMetricsOptions({ locale: 'en', timezone: 'UTC' })).not.toThrow();
      expect(() => validateMetricsOptions({ locale: 'pt-BR' })).not.toThrow();
      expect(() => validateMetricsOptions({ timezone: 'America/Sao_Paulo' })).not.toThrow();
      expect(() => validateMetricsOptions({})).not.toThrow();
    });

    it('rejects invalid locale', () => {
      expect(() => validateMetricsOptions({ locale: '' })).toThrow(ValidationError);
      expect(() => validateMetricsOptions({ locale: '123' })).toThrow(ValidationError);
    });

    it('rejects invalid timezone', () => {
      expect(() => validateMetricsOptions({ timezone: '' })).toThrow(ValidationError);
    });

    it('rejects non-string locale', () => {
      expect(() => validateMetricsOptions({ locale: 42 as never })).toThrow(ValidationError);
    });

    it('rejects unknown properties gracefully (Zod strips by default)', () => {
      const opts = validateMetricsOptions({ locale: 'en', extra: true } as never);
      // Unknown keys are stripped by Zod's default behavior (.strip())
      expect(opts).toHaveProperty('locale', 'en');
      expect((opts as Record<string, unknown>).extra).toBeUndefined();
    });

    it('ValidationError has readable message with paths', () => {
      try {
        validateMetricsOptions({ locale: '' });
        expect.fail('should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(ValidationError);
        expect((e as ValidationError).message).toContain('locale');
        expect((e as ValidationError).issues.length).toBeGreaterThan(0);
      }
    });
  });

  describe('schema validation (ExecutorSpec)', () => {
    it('accepts valid spec', () => {
      expect(() =>
        validateExecutorSpec({ table: 'orders', dateColumn: 'created_at' }),
      ).not.toThrow();
    });

    it('rejects missing table', () => {
      expect(() => validateExecutorSpec({} as never)).toThrow(ValidationError);
    });

    it('rejects table with injection', () => {
      expect(() =>
        validateExecutorSpec({ table: 'orders; DROP TABLE users' }),
      ).toThrow(ValidationError);
    });

    it('rejects empty table', () => {
      expect(() => validateExecutorSpec({ table: '' })).toThrow(ValidationError);
    });

    it('rejects empty dateColumn', () => {
      expect(() =>
        validateExecutorSpec({ table: 'orders', dateColumn: '' }),
      ).toThrow(ValidationError);
    });

    it('rejects empty from', () => {
      expect(() =>
        validateExecutorSpec({ table: 'orders', from: '' }),
      ).toThrow(ValidationError);
    });

    it('accepts spec with where filters', () => {
      expect(() =>
        validateExecutorSpec({
          table: 'orders',
          where: { status: 'pending', amount: { gte: 100 } },
        }),
      ).not.toThrow();
    });

    it('rejects where with non-scalar value', () => {
      expect(() =>
        validateExecutorSpec({
          table: 'orders',
          where: { status: Symbol('test') as never },
        }),
      ).toThrow(ValidationError);
    });
  });

  describe('schema validation (MetricsModuleOptions)', () => {
    it('accepts valid module options', () => {
      expect(() => validateMetricsModuleOptions({ locale: 'en' })).not.toThrow();
      expect(() => validateMetricsModuleOptions({})).not.toThrow();
    });

    it('rejects invalid locale', () => {
      expect(() => validateMetricsModuleOptions({ locale: '' })).toThrow(ValidationError);
    });
  });

  describe('builder integration with skipValidation', () => {
    it('rejects invalid MetricsOptions in the builder constructor', () => {
      expect(() => m().count()).not.toThrow(); // defaults are valid
    });

    it('respects skipValidation flag', () => {
      Metrics.skipValidation = true;
      try {
        // Even invalid options should be accepted when validation is skipped
        expect(() =>
          Metrics.query(ordersQuery(dataSource), { locale: '' as never }),
        ).not.toThrow();
      } finally {
        Metrics.skipValidation = false;
      }
    });

    it('rejects invalid MetricsOptions when skipValidation is false', () => {
      Metrics.skipValidation = false;
      expect(() =>
        Metrics.query(ordersQuery(dataSource), { locale: '' as never }),
      ).toThrow(ValidationError);
    });
  });

  describe('MetricsOptionsSchema type inference', () => {
    it('infers correct type from schema', () => {
      const parsed = MetricsOptionsSchema.parse({ locale: 'en', timezone: 'UTC' });
      expect(parsed.locale).toBe('en');
      expect(parsed.timezone).toBe('UTC');
    });

    it('applies defaults', () => {
      const parsed = MetricsOptionsSchema.parse({});
      expect(parsed.locale).toBeUndefined();
      expect(parsed.timezone).toBeUndefined();
    });
  });

  describe('ExecutorSpecSchema type inference', () => {
    it('infers correct type from schema', () => {
      const parsed = ExecutorSpecSchema.parse({ table: 'orders' });
      expect(parsed.table).toBe('orders');
      expect(parsed.dateColumn).toBeUndefined();
    });
  });
});
