import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.spec.ts'],
    globals: false,
    // External DB specs share one persistent Postgres/MySQL database and
    // reset it per-test; serialize files so they can't truncate each other.
    fileParallelism: false,
  },
});
