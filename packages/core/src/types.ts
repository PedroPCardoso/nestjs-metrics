/** A chart-ready time series: parallel label/data arrays. */
export interface TrendsResult {
  labels: (string | number)[];
  data: number[];
}

/**
 * A multi-series result (from groupData): a shared label axis plus one data
 * series per group, alongside the `total` series.
 */
export interface GroupedTrendsResult {
  labels: (string | number)[];
  data: {
    total: number[];
    [group: string]: number[];
  };
}

/** A metric plus its variation against a prior period. */
export interface VariationResult {
  count: number;
  variation: {
    type: 'none' | 'increase' | 'decrease';
    value: number | string;
  };
}

/** Per-call configuration for a metrics query. */
export type { MetricsOptions } from './options.schema';
