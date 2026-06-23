import { Inject, Injectable, Optional } from '@nestjs/common';
import { ObjectLiteral, SelectQueryBuilder } from 'typeorm';
import { MetricsBuilder } from '../metrics.builder';
import { MetricsOptions } from '../types';
import { METRICS_FEATURE_OPTIONS, METRICS_ROOT_OPTIONS, MetricsModuleOptions } from './tokens';

/**
 * Injectable facade over MetricsBuilder. Resolves configuration with the
 * precedence: call-site option > forFeature > forRoot > library default.
 */
@Injectable()
export class MetricsService {
  private readonly defaults: MetricsModuleOptions;

  constructor(
    @Optional() @Inject(METRICS_ROOT_OPTIONS) root: MetricsModuleOptions = {},
    @Optional() @Inject(METRICS_FEATURE_OPTIONS) feature: MetricsModuleOptions = {},
  ) {
    // feature overrides root.
    this.defaults = { ...root, ...feature };
  }

  query<T extends ObjectLiteral>(
    qb: SelectQueryBuilder<T>,
    options: MetricsOptions = {},
  ): MetricsBuilder<T> {
    return MetricsBuilder.query(qb, {
      locale: options.locale ?? this.defaults.locale,
      timezone: options.timezone ?? this.defaults.timezone,
    });
  }
}
