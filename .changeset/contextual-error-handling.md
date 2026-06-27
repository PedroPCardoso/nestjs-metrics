---
"nestjs-metrics-core": minor
"nestjs-metrics": minor
"nextjs-metrics": minor
---

Add contextual error handling. All errors now extend a shared `MetricsError` base
class carrying a stable, machine-readable `code` and an optional structured
`context`. Database failures are wrapped in a new `QueryExecutionError` that
preserves the original error on `cause` and attaches the SQL, parameters and
dialect that produced it. A new `ConfigurationError` (with an actionable
`suggestion`) replaces the plain errors thrown for unsupported drivers and
undetectable Drizzle dialects. The existing typed exceptions keep their names,
messages and `instanceof Error` behaviour, so this is fully backward compatible.
