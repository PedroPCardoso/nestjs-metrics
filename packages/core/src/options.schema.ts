import { z } from 'zod';

const BCP47 = /^[a-z]{2,3}(-[A-Z][a-z]{3})?(-[A-Z]{2,3})?$/;

const LocaleSchema = z.string().min(1).refine(
  (val) => BCP47.test(val),
  { message: 'Locale must be a valid BCP-47 tag (e.g. "en", "pt-BR")' },
);

const IdentifierSchema = z.string().min(1).refine(
  (val) => /^[a-zA-Z_][a-zA-Z0-9_.]*$/.test(val),
  { message: 'Must be a valid SQL identifier (alphanumeric, underscore, or dot-separated)' },
);

const TimezoneSchema = z.string().min(1);

const WhereScalarSchema: z.ZodType<import('./where').WhereScalar> = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
]);

const RangeConditionSchema: z.ZodType<import('./where').RangeCondition> = z.object({
  gte: WhereScalarSchema.optional(),
  lte: WhereScalarSchema.optional(),
  gt: WhereScalarSchema.optional(),
  lt: WhereScalarSchema.optional(),
});

const WhereConditionSchema: z.ZodType<import('./where').WhereCondition> = z.union([
  WhereScalarSchema,
  z.array(WhereScalarSchema),
  RangeConditionSchema,
]);

const WhereInputSchema: z.ZodType<import('./where').WhereInput> = z.record(
  z.string(),
  WhereConditionSchema,
);

/** Zod schema validating {@link MetricsOptions} at a builder entry point. */
export const MetricsOptionsSchema = z.object({
  locale: LocaleSchema.optional(),
  timezone: TimezoneSchema.optional(),
  cache: z
    .object({
      enabled: z.boolean(),
      ttl: z.number(),
    })
    .optional(),
});

/** Zod schema validating {@link ExecutorSpec} passed to `queryExecutor`. */
export const ExecutorSpecSchema = z.object({
  table: IdentifierSchema,
  dateColumn: z.string().min(1).optional(),
  where: WhereInputSchema.optional(),
  from: z.string().min(1).optional(),
});

/** Zod schema validating {@link MetricsModuleOptions} for the NestJS module. */
export const MetricsModuleOptionsSchema = z.object({
  locale: LocaleSchema.optional(),
  timezone: TimezoneSchema.optional(),
});

/** Per-call options for a metrics query: BCP-47 `locale`, IANA `timezone`, and opt-in `cache`. */
export type MetricsOptions = z.infer<typeof MetricsOptionsSchema>;
/**
 * Declares the source the executor-mode builder reads from: a `table` plus
 * optional `dateColumn`/`where`, with a raw `from` fragment as the escape hatch
 * for joins/subqueries the structured shape can't express.
 */
export type ExecutorSpec = z.infer<typeof ExecutorSpecSchema>;
/** Module-wide defaults for `MetricsModule.forRoot`: a BCP-47 `locale` and IANA `timezone`. */
export type MetricsModuleOptions = z.infer<typeof MetricsModuleOptionsSchema>;

/** Thrown when options fail schema validation; carries the underlying Zod `issues`. */
export class ValidationError extends Error {
  public readonly issues: z.ZodIssue[];

  constructor(message: string, issues: z.ZodIssue[]) {
    super(message);
    this.name = 'MetricsValidationError';
    this.issues = issues;
  }
}

function formatIssues(issues: z.ZodIssue[]): string {
  return issues
    .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n');
}

/**
 * Validate and narrow an unknown value to {@link MetricsOptions}.
 * @param input - The value to validate.
 * @returns The parsed options.
 * @throws {@link ValidationError} when `input` does not match the schema.
 */
export function validateMetricsOptions(input: unknown): MetricsOptions {
  const result = MetricsOptionsSchema.safeParse(input);
  if (!result.success) {
    throw new ValidationError(
      `Invalid MetricsOptions:\n${formatIssues(result.error.issues)}`,
      result.error.issues,
    );
  }
  return result.data;
}

/**
 * Validate and narrow an unknown value to {@link ExecutorSpec}.
 * @param input - The value to validate.
 * @returns The parsed spec.
 * @throws {@link ValidationError} when `input` does not match the schema.
 */
export function validateExecutorSpec(input: unknown): ExecutorSpec {
  const result = ExecutorSpecSchema.safeParse(input);
  if (!result.success) {
    throw new ValidationError(
      `Invalid ExecutorSpec:\n${formatIssues(result.error.issues)}`,
      result.error.issues,
    );
  }
  return result.data;
}

/**
 * Validate and narrow an unknown value to {@link MetricsModuleOptions}.
 * @param input - The value to validate.
 * @returns The parsed module options.
 * @throws {@link ValidationError} when `input` does not match the schema.
 */
export function validateMetricsModuleOptions(input: unknown): MetricsModuleOptions {
  const result = MetricsModuleOptionsSchema.safeParse(input);
  if (!result.success) {
    throw new ValidationError(
      `Invalid MetricsModuleOptions:\n${formatIssues(result.error.issues)}`,
      result.error.issues,
    );
  }
  return result.data;
}
