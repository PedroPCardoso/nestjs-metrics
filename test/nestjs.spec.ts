import 'reflect-metadata';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Inject, Injectable, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { Metrics, metricsFor, TrendsResult, withMetrics } from '@pedropcardoso/metrics-core';
import { MetricsModule, MetricsService } from '@pedropcardoso/metrics-nestjs';
import {
  Order,
  createOrdersDataSource,
  ordersQuery,
  resetOrders,
  seedOrders,
} from './helpers/orders-datasource';

const SP = 'America/Sao_Paulo';

describe('NestJS integration', () => {
  let dataSource: DataSource;

  beforeAll(async () => {
    dataSource = await createOrdersDataSource();
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  beforeEach(async () => {
    await resetOrders(dataSource);
    await seedOrders(dataSource, [{ createdAt: '2026-01-10 10:00:00' }]);
  });

  it('MetricsService is injectable and produces correct results', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [MetricsModule.forRoot()],
    }).compile();
    const service = moduleRef.get(MetricsService);

    const viaService = await service
      .query(ordersQuery(dataSource))
      .count()
      .byMonth()
      .forYear(2026)
      .trends();
    const viaQuery = await Metrics.query(ordersQuery(dataSource))
      .count()
      .byMonth()
      .forYear(2026)
      .trends();

    expect(viaService).toEqual(viaQuery);
    await moduleRef.close();
  });

  it('forRoot provides app-wide locale defaults', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [MetricsModule.forRoot({ locale: 'pt-BR' })],
    }).compile();
    const service = moduleRef.get(MetricsService);

    const r = (await service
      .query(ordersQuery(dataSource))
      .count()
      .byMonth()
      .forYear(2026)
      .trends()) as TrendsResult;
    expect(r.labels).toEqual(['janeiro']);
    await moduleRef.close();
  });

  it('forFeature overrides forRoot, and a call option overrides both', async () => {
    // Consumers injected in each module scope mirror real usage: a root-level
    // service gets the global forRoot config; a feature-module service gets the
    // forFeature override merged over root.
    @Injectable()
    class RootConsumer {
      constructor(@Inject(MetricsService) readonly metrics: MetricsService) {}
    }
    @Injectable()
    class FeatureConsumer {
      constructor(@Inject(MetricsService) readonly metrics: MetricsService) {}
    }
    @Module({
      imports: [MetricsModule.forFeature({ locale: 'en' })],
      providers: [FeatureConsumer],
    })
    class ReportsModule {}

    const moduleRef = await Test.createTestingModule({
      imports: [MetricsModule.forRoot({ locale: 'pt-BR' }), ReportsModule],
      providers: [RootConsumer],
    }).compile();

    const rootConsumer = moduleRef.get(RootConsumer);
    const featureConsumer = moduleRef.select(ReportsModule).get(FeatureConsumer);

    const label = (service: MetricsService, opts?: { locale?: string }) =>
      service
        .query(ordersQuery(dataSource), opts)
        .count()
        .byMonth()
        .forYear(2026)
        .trends()
        .then((r) => (r as TrendsResult).labels[0]);

    expect(await label(rootConsumer.metrics)).toBe('janeiro'); // forRoot
    expect(await label(featureConsumer.metrics)).toBe('January'); // forFeature overrides forRoot
    expect(await label(featureConsumer.metrics, { locale: 'fr' })).toBe('janvier'); // call wins
    await moduleRef.close();
  });

  it('all entry points return identical results for the same query', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [MetricsModule.forRoot()],
    }).compile();
    const service = moduleRef.get(MetricsService);
    const repo = dataSource.getRepository(Order);
    const run = (b: ReturnType<typeof Metrics.query>) =>
      b.sum('amount').byMonth().forYear(2026).trends();

    const expected = await run(Metrics.query(ordersQuery(dataSource)));
    expect(await run(service.query(ordersQuery(dataSource)))).toEqual(expected);
    expect(await run(metricsFor(repo))).toEqual(expected);
    expect(await run(withMetrics(repo).metrics())).toEqual(expected);
    await moduleRef.close();
  });

  it('timezone precedence: call > forFeature > forRoot', async () => {
    await resetOrders(dataSource);
    // 02:00 UTC is Jul 15 in UTC, but Jul 14 in São Paulo (-3).
    await seedOrders(dataSource, [{ createdAt: '2026-07-15 02:00:00' }]);

    @Injectable()
    class RootConsumer {
      constructor(@Inject(MetricsService) readonly metrics: MetricsService) {}
    }
    @Injectable()
    class FeatureConsumer {
      constructor(@Inject(MetricsService) readonly metrics: MetricsService) {}
    }
    @Module({
      imports: [MetricsModule.forFeature({ timezone: SP })],
      providers: [FeatureConsumer],
    })
    class ReportsModule {}

    const moduleRef = await Test.createTestingModule({
      imports: [MetricsModule.forRoot({ timezone: 'UTC' }), ReportsModule],
      providers: [RootConsumer],
    }).compile();

    const root = moduleRef.get(RootConsumer).metrics;
    const feature = moduleRef.select(ReportsModule).get(FeatureConsumer).metrics;
    const onJul14 = (svc: MetricsService, opts?: { timezone?: string }) =>
      svc.query(ordersQuery(dataSource), opts).count().between('2026-07-14', '2026-07-14').metrics();

    expect(await onJul14(root)).toBe(0); // forRoot UTC → row is on Jul 15
    expect(await onJul14(feature)).toBe(1); // forFeature SP overrides → Jul 14
    expect(await onJul14(feature, { timezone: 'UTC' })).toBe(0); // call overrides feature
    await moduleRef.close();
  });

  it('forRoot timezone flows through the service', async () => {
    await resetOrders(dataSource);
    await seedOrders(dataSource, [{ createdAt: '2026-07-15 02:00:00' }]); // 23:00 Jul 14 in SP

    const moduleRef = await Test.createTestingModule({
      imports: [MetricsModule.forRoot({ timezone: SP })],
    }).compile();
    const service = moduleRef.get(MetricsService);

    expect(
      await service.query(ordersQuery(dataSource)).count().between('2026-07-14', '2026-07-14').metrics(),
    ).toBe(1);
    await moduleRef.close();
  });
});
