import { Aggregate } from './enums/aggregate.enum';
import { InvalidAggregateException } from './exceptions/invalid-aggregate.exception';
import { InvalidDateFormatException } from './exceptions/invalid-date-format.exception';
import { InvalidIdentifierException } from './exceptions/invalid-identifier.exception';

const IDENTIFIER = /^[a-zA-Z_][a-zA-Z0-9_.]*$/;
const DATE_FORMAT = /^\d{4}-\d{2}-\d{2}$/;
const AGGREGATES = Object.values(Aggregate) as string[];

/**
 * Reject anything that is not a plain SQL identifier before it is interpolated
 * into raw SQL. Named parameters do not protect identifiers, so this is the
 * choke point that closes the injection vector (ARCHITECTURE §0, decision 2).
 */
export function assertSafeIdentifier(identifier: string): void {
  if (!IDENTIFIER.test(identifier)) {
    throw new InvalidIdentifierException(identifier);
  }
}

export function assertDateFormat(value: string): void {
  if (!DATE_FORMAT.test(value) || Number.isNaN(Date.parse(value))) {
    throw new InvalidDateFormatException(value);
  }
}

export function assertAggregate(aggregate: Aggregate): void {
  if (!AGGREGATES.includes(aggregate)) {
    throw new InvalidAggregateException(aggregate);
  }
}
