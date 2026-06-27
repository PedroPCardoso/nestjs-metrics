import { DynamicModule, Module } from '@nestjs/common';
import { MetricsService } from './metrics.service';
import { METRICS_FEATURE_OPTIONS, METRICS_ROOT_OPTIONS, MetricsModuleOptions } from './tokens';
import { MetricsBuilder, validateMetricsModuleOptions } from 'nestjs-metrics-core';

/**
 * NestJS dynamic module that wires up {@link MetricsService}. Register
 * app-wide defaults with {@link MetricsModule.forRoot | forRoot} and override
 * them per feature with {@link MetricsModule.forFeature | forFeature}.
 *
 * @example
 * ```ts
 * @Module({ imports: [MetricsModule.forRoot({ locale: 'pt-BR', timezone: 'America/Sao_Paulo' })] })
 * export class AppModule {}
 * ```
 */
@Module({})
export class MetricsModule {
  /**
   * Register app-wide defaults; the resulting {@link MetricsService} is global.
   * @param options - Default locale/timezone applied to every query unless overridden.
   * @returns A global dynamic module exporting {@link MetricsService}.
   * @throws A `ValidationError` (from the core) when `options` fail schema validation.
   */
  static forRoot(options: MetricsModuleOptions = {}): DynamicModule {
    if (!MetricsBuilder.skipValidation) {
      validateMetricsModuleOptions(options);
    }
    return {
      module: MetricsModule,
      global: true,
      providers: [
        { provide: METRICS_ROOT_OPTIONS, useValue: options },
        MetricsService,
      ],
      exports: [MetricsService, METRICS_ROOT_OPTIONS],
    };
  }

  /**
   * Override the defaults within a feature module. Provides a feature-scoped
   * MetricsService that merges these options over the global forRoot defaults.
   * Works without forRoot too (the root options are optional → library defaults).
   *
   * @param options - Feature-scoped locale/timezone, merged over the forRoot defaults.
   * @returns A dynamic module exporting a feature-scoped {@link MetricsService}.
   * @throws A `ValidationError` (from the core) when `options` fail schema validation.
   */
  static forFeature(options: MetricsModuleOptions = {}): DynamicModule {
    if (!MetricsBuilder.skipValidation) {
      validateMetricsModuleOptions(options);
    }
    return {
      module: MetricsModule,
      providers: [
        { provide: METRICS_FEATURE_OPTIONS, useValue: options },
        MetricsService,
      ],
      exports: [MetricsService],
    };
  }
}
