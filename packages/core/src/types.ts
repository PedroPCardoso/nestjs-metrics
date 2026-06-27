/** A chart-ready time series: parallel label/data arrays. */
export interface TrendsResult {
  /** Bucket labels (e.g. month names), in chart order. */
  labels: (string | number)[];
  /** Aggregate value per bucket, aligned to {@link TrendsResult.labels}. */
  data: number[];
}

/**
 * A multi-series result (from groupData): a shared label axis plus one data
 * series per group, alongside the `total` series.
 */
export interface GroupedTrendsResult {
  /** Shared bucket labels for every series, in chart order. */
  labels: (string | number)[];
  /** One numeric series per group value, plus a `total` series across all groups. */
  data: {
    total: number[];
    [group: string]: number[];
  };
}

/** A metric plus its variation against a prior period. */
export interface VariationResult {
  /** The current period's aggregate value. */
  count: number;
  /** Direction and magnitude of the change versus the prior period. */
  variation: {
    /** Whether the metric rose, fell, or held steady. */
    type: 'none' | 'increase' | 'decrease';
    /** Absolute delta, or a percentage string when requested via `inPercent`. */
    value: number | string;
  };
}

/** Per-call configuration for a metrics query. */
export type { MetricsOptions } from './options.schema';
