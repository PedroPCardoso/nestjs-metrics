import { z } from 'zod';
import { MetricsError } from './exceptions/metrics.error';

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

export const ExecutorSpecSchema = z.object({
  table: IdentifierSchema,
  dateColumn: z.string().min(1).optional(),
  where: WhereInputSchema.optional(),
  from: z.string().min(1).optional(),
});

export const MetricsModuleOptionsSchema = z.object({
  locale: LocaleSchema.optional(),
  timezone: TimezoneSchema.optional(),
});

export type MetricsOptions = z.infer<typeof MetricsOptionsSchema>;
export type ExecutorSpec = z.infer<typeof ExecutorSpecSchema>;
export type MetricsModuleOptions = z.infer<typeof MetricsModuleOptionsSchema>;

export class ValidationError extends MetricsError {
  public readonly issues: z.ZodIssue[];

  constructor(message: string, issues: z.ZodIssue[]) {
    super(message, 'VALIDATION_ERROR', { issues });
    this.name = 'MetricsValidationError';
    this.issues = issues;
  }
}

function formatIssues(issues: z.ZodIssue[]): string {
  return issues
    .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n');
}

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
