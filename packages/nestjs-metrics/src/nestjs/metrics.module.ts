import { DynamicModule, Module } from '@nestjs/common';
import { MetricsService } from './metrics.service';
import { METRICS_FEATURE_OPTIONS, METRICS_ROOT_OPTIONS, MetricsModuleOptions } from './tokens';
import { MetricsBuilder, validateMetricsModuleOptions } from 'nestjs-metrics-core';

@Module({})
export class MetricsModule {
  /** Register app-wide defaults. Globally available. */
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
