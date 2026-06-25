# nestjs-metrics

Back-compat façade for the [metrics-kit](https://github.com/PedroPCardoso/nestjs-metrics)
monorepo. It re-exports:

- `nestjs-metrics` → [`@pedropcardoso/metrics-core`](../core) (the engine + fluent API)
- `nestjs-metrics/nestjs` → [`@pedropcardoso/metrics-nestjs`](../nestjs) (the NestJS module)

```bash
npm i nestjs-metrics
```

```ts
import { Metrics, metricsFor } from 'nestjs-metrics';
import { MetricsModule, MetricsService } from 'nestjs-metrics/nestjs';
```

Existing code keeps working unchanged. For new projects you can depend on
`@pedropcardoso/metrics-core` / `@pedropcardoso/metrics-nestjs` directly, and on
[`@pedropcardoso/metrics-nextjs`](../nextjs) for Prisma/Drizzle.

See [`@pedropcardoso/metrics-core`](../core) for the full API.

## License

MIT
