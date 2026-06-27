/** Thrown when timezone-aware bucketing is requested on SQLite in executor mode (UTC-only there). */
export class SqliteTimezoneUnsupportedException extends Error {
  constructor(timezone: string) {
    super(
      `nestjs-metrics: timezone "${timezone}" is not supported on SQLite in the executor mode; ` +
        `SQLite buckets are UTC-only here (use Postgres/MySQL for timezone-aware trends).`,
    );
    this.name = 'SqliteTimezoneUnsupportedException';
  }
}
