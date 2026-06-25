import { DateTime } from 'luxon';

export interface BetterSqlite3Db {
  function(name: string, options: { deterministic: boolean }, fn: (...args: unknown[]) => unknown): void;
}

const registered = new WeakSet<object>();

/**
 * Register the `nm_tz_local(ts, tz)` SQLite user function once per connection.
 * It converts a UTC timestamp string to the target IANA zone's wall-clock time
 * (DST-correct via Luxon), so strftime can extract the local date parts.
 */
export function registerSqliteTz(db: BetterSqlite3Db): void {
  if (registered.has(db)) {
    return;
  }
  registered.add(db);

  db.function('nm_tz_local', { deterministic: true }, (ts: unknown, tz: unknown) => {
    if (ts === null || ts === undefined) {
      return null;
    }
    return DateTime.fromSQL(String(ts), { zone: 'utc' })
      .setZone(String(tz))
      .toFormat('yyyy-MM-dd HH:mm:ss');
  });
}
