import { Aggregate } from '../enums/aggregate.enum';
import { DatePart, SqlDialect } from './sql-dialect.interface';

export class PostgresDialect implements SqlDialect {
  aggregate(fn: Aggregate, column: string): string {
    return `${fn}(${column})`;
  }

  periodExpr(part: DatePart, column: string): string {
    switch (part) {
      case 'day':
        return `EXTRACT(DAY FROM ${column})`;
      case 'week':
        // EXTRACT(WEEK ...) is already the ISO-8601 week number in Postgres.
        return `EXTRACT(WEEK FROM ${column})`;
      case 'month':
        return `EXTRACT(MONTH FROM ${column})`;
      case 'year':
        return `EXTRACT(YEAR FROM ${column})`;
    }
  }

  dateBucket(part: DatePart, column: string): string {
    switch (part) {
      case 'day':
        return `to_char(${column}, 'YYYY-MM-DD')`;
      case 'month':
        return `to_char(${column}, 'YYYY-MM')`;
      case 'year':
        return `to_char(${column}, 'YYYY')`;
      case 'week':
        return `to_char(${column}, 'IYYY-"W"IW')`;
    }
  }

  convertTz(column: string, tzParam: string): string {
    return `((${column}) AT TIME ZONE 'UTC' AT TIME ZONE ${tzParam})`;
  }

  escapeId(name: string): string {
    return `"${name.replace(/"/g, '""')}"`;
  }

  placeholder(index: number): string {
    return `$${index}`;
  }
}
