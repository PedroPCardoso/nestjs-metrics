import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

// Tests live at the repo root and run against package SOURCE (not built dist)
// via these aliases, so the whole workspace is exercised in one vitest run.
const r = (p: string) => resolve(__dirname, p);

export default defineConfig({
  resolve: {
    alias: [
      { find: /^nestjs-metrics-core$/, replacement: r('packages/core/src/index.ts') },
      { find: /^nestjs-metrics\/nestjs$/, replacement: r('packages/nestjs-metrics/src/nestjs/index.ts') },
      { find: /^nestjs-metrics$/, replacement: r('packages/nestjs-metrics/src/index.ts') },
      { find: /^nextjs-metrics$/, replacement: r('packages/nextjs-metrics/src/index.ts') },
      { find: /^@core\/(.*)$/, replacement: r('packages/core/src') + '/$1' },
    ],
  },
  test: {
    include: ['test/**/*.spec.ts'],
    globals: false,
    // External DB specs share one persistent Postgres/MySQL database and
    // reset it per-test; serialize files so they can't truncate each other.
    fileParallelism: false,
  },
});
