/** A chart-ready time series: parallel label/data arrays. */
export interface TrendsResult {
  labels: (string | number)[];
  data: number[];
}

/** Per-call configuration for a metrics query. */
export interface MetricsOptions {
  /** BCP-47 locale used to translate period labels. Defaults to `en`. */
  locale?: string;
}
