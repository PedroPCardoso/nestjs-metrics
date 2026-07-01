# nestjs-metrics

Metrics & trends for **NestJS / TypeORM**. The engine ([`nestjs-metrics-core`](../core))
plus a NestJS module — two entry points:

| Import | For | Optional peer |
| --- | --- | --- |
| `nestjs-metrics` | the engine + fluent API | `typeorm` |
| `nestjs-metrics/nestjs` | the NestJS module + service | `@nestjs/common` |

```bash
npm install nestjs-metrics
```

`nestjs-metrics-core` comes along automatically. The terminals (`metrics()`,
`trends()`, `metricsWithVariations()`) are **async**.

## NestJS module

```ts
import { MetricsModule, MetricsService } from 'nestjs-metrics/nestjs';

@Module({
  imports: [MetricsModule.forRoot({ locale: 'pt-BR', timezone: 'America/Sao_Paulo' })],
})
export class AppModule {}

@Injectable()
export class DashboardService {
  constructor(
    private readonly metrics: MetricsService,
    @InjectRepository(Order) private readonly orders: Repository<Order>,
  ) {}

  monthlyRevenue() {
    return this.metrics
      .query(this.orders.createQueryBuilder('orders'))
      .sumByMonth('amount', 12)
      .forYear(2026)
      .fillMissingData()
      .trends();
  }
}
```

`MetricsModule.forRoot` is global; `MetricsModule.forFeature({ locale, timezone })`
overrides within a feature module. Precedence:
**call option > forFeature > forRoot > library default** (`en` / `UTC`).

## Standalone

```ts
import { Metrics, metricsFor, withMetrics } from 'nestjs-metrics';

await Metrics.query(orderRepo.createQueryBuilder('orders')).sum('amount').byMonth().forYear(2026).trends();
```

The full fluent API lives in [`nestjs-metrics-core`](../core).

## NestJS guide

For a comprehensive walkthrough of all features, queries, filters and usage
patterns, check the [NestJ ReadMe guide](https://nestjs-metrics.readme.io/docs/getting-started).

## License

MIT
