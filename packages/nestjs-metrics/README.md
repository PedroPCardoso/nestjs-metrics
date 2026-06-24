# nestjs-metrics

Back-compat façade for the [`@metrics-kit`](https://github.com/PedroPCardoso/nestjs-metrics)
monorepo. It re-exports:

- `nestjs-metrics` → [`@metrics-kit/core`](../core) (the engine + fluent API)
- `nestjs-metrics/nestjs` → [`@metrics-kit/nestjs`](../nestjs) (the NestJS module)

```bash
npm i nestjs-metrics
```

```ts
import { Metrics, metricsFor } from 'nestjs-metrics';
import { MetricsModule, MetricsService } from 'nestjs-metrics/nestjs';
```

Existing code keeps working unchanged. For new projects you can depend on
`@metrics-kit/core` / `@metrics-kit/nestjs` directly, and on
[`@metrics-kit/nextjs`](../nextjs) for Prisma/Drizzle.

See [`@metrics-kit/core`](../core) for the full API.

## License

MIT
