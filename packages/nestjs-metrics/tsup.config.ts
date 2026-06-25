import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/nestjs/index.ts'],
  format: ['cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
  target: 'node18',
  external: ['@pedropcardoso/metrics-core', '@pedropcardoso/metrics-nestjs'],
});
