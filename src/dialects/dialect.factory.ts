import { MySqlDialect } from './mysql.dialect';
import { PostgresDialect } from './postgres.dialect';
import { SqlDialect } from './sql-dialect.interface';
import { SqliteDialect } from './sqlite.dialect';

/**
 * Resolve the SqlDialect strategy from the TypeORM driver type.
 */
export function dialectFor(driverType: string): SqlDialect {
  switch (driverType) {
    case 'sqlite':
    case 'better-sqlite3':
      return new SqliteDialect();
    case 'postgres':
      return new PostgresDialect();
    case 'mysql':
    case 'mariadb':
      return new MySqlDialect();
    default:
      throw new Error(`nestjs-metrics: unsupported database driver "${driverType}"`);
  }
}
