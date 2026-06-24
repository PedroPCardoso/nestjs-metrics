import { Aggregate } from '../enums/aggregate.enum';
import { DatePart, SqlDialect } from './sql-dialect.interface';

export class MySqlDialect implements SqlDialect {
  aggregate(fn: Aggregate, column: string): string {
    return `${fn}(${column})`;
  }

  periodExpr(part: DatePart, column: string): string {
    switch (part) {
      case 'day':
        return `day(${column})`;
      case 'week':
        // WEEKOFYEAR == WEEK(col, 3) == ISO-8601 week number.
        return `WEEKOFYEAR(${column})`;
      case 'month':
        return `month(${column})`;
      case 'year':
        return `year(${column})`;
    }
  }

  dateBucket(part: DatePart, column: string): string {
    switch (part) {
      case 'day':
        return `date_format(${column}, '%Y-%m-%d')`;
      case 'month':
        return `date_format(${column}, '%Y-%m')`;
      case 'year':
        return `date_format(${column}, '%Y')`;
      case 'week':
        return `date_format(${column}, '%x-W%v')`;
    }
  }

  convertTz(column: string, tzParam: string): string {
    return `CONVERT_TZ(${column}, 'UTC', ${tzParam})`;
  }

  escapeId(name: string): string {
    return `\`${name.replace(/`/g, '``')}\``;
  }

  placeholder(): string {
    return '?';
  }
}
