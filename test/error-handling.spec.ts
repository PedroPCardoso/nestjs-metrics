import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DataSource as TypeOrmDataSource } from 'typeorm';
import {
  ConfigurationError,
  InvalidAggregateException,
  InvalidDateFormatException,
  InvalidIdentifierException,
  InvalidPeriodException,
  InvalidTimezoneException,
  InvalidVariationsCountException,
  MetricsBuilder,
  MetricsError,
  QueryExecutionError,
  SqliteTimezoneUnsupportedException,
  ValidationError,
  validateMetricsOptions,
} from 'nestjs-metrics-core';
import { drizzleMetrics } from 'nextjs-metrics';
import { DataSource } from '@core/datasource';
import { dialectFor } from '@core/dialects/dialect.factory';
import { createOrdersDataSource, ordersQuery } from './helpers/orders-datasource';

describe('contextual error handling (#31)', () => {
  describe('MetricsError hierarchy & codes', () => {
    // Each typed exception keeps its name/message and `instanceof Error`, and now
    // also extends MetricsError carrying a stable, machine-readable code.
    const cases: Array<[MetricsError, string]> = [
      [new InvalidAggregateException('xyz'), 'INVALID_AGGREGATE'],
      [new InvalidDateFormatException('2026/01/01'), 'INVALID_DATE_FORMAT'],
      [new InvalidIdentifierException('id; DROP'), 'INVALID_IDENTIFIER'],
      [new InvalidPeriodException('today'), 'INVALID_PERIOD'],
      [new InvalidTimezoneException('Mars/Olympus'), 'INVALID_TIMEZONE'],
      [new InvalidVariationsCountException(), 'INVALID_VARIATIONS_COUNT'],
      [new SqliteTimezoneUnsupportedException('America/Sao_Paulo'), 'SQLITE_TIMEZONE_UNSUPPORTED'],
    ];

    it.each(cases)('%o carries the right code and stays an Error', (error, code) => {
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(MetricsError);
      expect(error.code).toBe(code);
    });

    it('keeps existing messages byte-for-byte (backward compatible)', () => {
      expect(new InvalidIdentifierException('bad').message).toContain(
        'nestjs-metrics: invalid identifier "bad"',
      );
      expect(new InvalidDateFormatException('2026/01/01').message).toBe(
        'nestjs-metrics: invalid date "2026/01/01", expected YYYY-MM-DD',
      );
    });
  });

  describe('ValidationError folds into the hierarchy', () => {
    it('is a MetricsError with code VALIDATION_ERROR and keeps its issues', () => {
      let caught: unknown;
      try {
        validateMetricsOptions({ timezone: 123 });
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(ValidationError);
      expect(caught).toBeInstanceOf(MetricsError);
      expect((caught as ValidationError).code).toBe('VALIDATION_ERROR');
      expect((caught as ValidationError).name).toBe('MetricsValidationError');
      expect((caught as ValidationError).issues.length).toBeGreaterThan(0);
    });
  });

  describe('ConfigurationError', () => {
    it('is thrown for an unsupported driver, with a suggestion', () => {
      let caught: unknown;
      try {
        dialectFor('oracle');
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(ConfigurationError);
      expect((caught as ConfigurationError).code).toBe('CONFIGURATION_ERROR');
      expect((caught as ConfigurationError).suggestion).toContain('postgres');
      expect((caught as ConfigurationError).context?.dialect).toBe('oracle');
    });

    it('is thrown when the drizzle dialect cannot be auto-detected', () => {
      let caught: unknown;
      try {
        // String table + no dialect → cannot be auto-detected.
        drizzleMetrics({ $client: {} }, { table: 'orders' });
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(ConfigurationError);
      expect((caught as ConfigurationError).suggestion).toContain('dialect');
    });
  });

  describe('QueryExecutionError wraps driver failures with context', () => {
    let typeorm: TypeOrmDataSource;
    let dataSource: DataSource;

    beforeAll(async () => {
      typeorm = await createOrdersDataSource('better-sqlite3');
      dataSource = {
        dialect: 'sqlite',
        execute: (sql, params) => typeorm.query(sql, params),
      };
    });

    afterAll(async () => {
      await typeorm.destroy();
    });

    it('wraps a failing query in the executor path', async () => {
      // `does_not_exist` passes the identifier allowlist but is not a real column,
      // so the driver rejects the query at execution time.
      const builder = MetricsBuilder.queryExecutor(dataSource, {
        table: 'orders',
        dateColumn: 'created_at',
      });

      let caught: unknown;
      try {
        await builder.sum('does_not_exist').metrics();
      } catch (err) {
        caught = err;
      }

      expect(caught).toBeInstanceOf(QueryExecutionError);
      const error = caught as QueryExecutionError;
      expect(error.code).toBe('QUERY_EXECUTION_ERROR');
      expect(error.context?.query).toBeTruthy();
      expect(error.context?.dialect).toBe('sqlite');
      expect((error as { cause?: unknown }).cause).toBeInstanceOf(Error);
    });

    it('wraps a failing query in the TypeORM path', async () => {
      let caught: unknown;
      try {
        await MetricsBuilder.query(ordersQuery(typeorm)).sum('does_not_exist').metrics();
      } catch (err) {
        caught = err;
      }

      expect(caught).toBeInstanceOf(QueryExecutionError);
      const error = caught as QueryExecutionError;
      expect(error.code).toBe('QUERY_EXECUTION_ERROR');
      expect(error.context?.query).toBeTruthy();
      expect((error as { cause?: unknown }).cause).toBeInstanceOf(Error);
    });
  });
});
