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
        return `week(${column})`;
      case 'month':
        return `month(${column})`;
      case 'year':
        return `year(${column})`;
    }
  }
}
