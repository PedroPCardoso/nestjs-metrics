# @metrics-kit/nestjs

NestJS module + injectable `MetricsService` over [`@metrics-kit/core`](../core)
(TypeORM).

```bash
npm i @metrics-kit/nestjs
```

Peer deps: `@nestjs/common ^10 || ^11`, `typeorm ^0.3`.

```ts
import { MetricsModule, MetricsService } from '@metrics-kit/nestjs';

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
overrides the defaults within a feature module. Precedence:
**call option > forFeature > forRoot > library default** (`en` / `UTC`).

The full fluent API lives in [`@metrics-kit/core`](../core).

## License

MIT
