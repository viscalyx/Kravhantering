import { NextResponse } from 'next/server'
import { type ZodError, type ZodType, z } from 'zod'
import {
  ARRAY_INPUT_MAX_ITEMS,
  BUSINESS_TEXT_MAX_LENGTH,
} from '@/lib/http/validation-constants'

export const DB_STRING_MAX_LENGTH = 450
export const SEARCH_STRING_MAX_LENGTH = 250
export const SQL_SERVER_INT_MAX = 2_147_483_647
export { ARRAY_INPUT_MAX_ITEMS, BUSINESS_TEXT_MAX_LENGTH }

export interface InvalidRequestIssue {
  code: string
  message: string
  path: string
}

export interface InvalidRequestBody {
  error: 'Invalid request'
  issues: InvalidRequestIssue[]
}

export type ValidationResult<T> =
  | { data: T; ok: true }
  | { ok: false; response: NextResponse<InvalidRequestBody> }

export const positiveIntegerSchema = z
  .number()
  .int()
  .min(1)
  .max(SQL_SERVER_INT_MAX)

export const nonNegativeIntegerSchema = z
  .number()
  .int()
  .min(0)
  .max(SQL_SERVER_INT_MAX)

export const positiveIntegerStringSchema = z
  .string()
  .trim()
  .regex(/^[1-9]\d*$/, 'Expected a positive integer')
  .transform(value => Number(value))
  .pipe(positiveIntegerSchema)

export const nonNegativeIntegerStringSchema = z
  .string()
  .trim()
  .regex(/^(0|[1-9]\d*)$/, 'Expected a non-negative integer')
  .transform(value => Number(value))
  .pipe(nonNegativeIntegerSchema)

export const boundedDbStringSchema = z
  .string()
  .trim()
  .min(1)
  .max(DB_STRING_MAX_LENGTH)

export const routeSegmentSchema = boundedDbStringSchema

export const refOrPositiveIntegerSegmentSchema = routeSegmentSchema.refine(
  value => {
    if (/^\d+$/.test(value)) {
      const numeric = Number(value)
      return (
        Number.isInteger(numeric) &&
        numeric > 0 &&
        numeric <= SQL_SERVER_INT_MAX
      )
    }

    return !/^-?\d+(?:\.\d+)?$/.test(value)
  },
  { message: 'Expected a positive integer id or non-numeric reference' },
)

export const requirementRefSchema = refOrPositiveIntegerSegmentSchema

export const optionalBoundedDbStringSchema = z
  .string()
  .trim()
  .max(DB_STRING_MAX_LENGTH)
  .optional()

export const nullableBoundedDbStringSchema = z
  .string()
  .trim()
  .max(DB_STRING_MAX_LENGTH)
  .nullable()

export const businessTextSchema = z
  .string()
  .trim()
  .min(1)
  .max(BUSINESS_TEXT_MAX_LENGTH)

export const optionalBusinessTextSchema = z
  .string()
  .trim()
  .max(BUSINESS_TEXT_MAX_LENGTH)
  .optional()

export const nullableBusinessTextSchema = z
  .string()
  .trim()
  .max(BUSINESS_TEXT_MAX_LENGTH)
  .nullable()

export const searchStringSchema = z
  .string()
  .trim()
  .min(1)
  .max(SEARCH_STRING_MAX_LENGTH)

export const optionalSearchStringSchema = z
  .string()
  .trim()
  .max(SEARCH_STRING_MAX_LENGTH)
  .optional()
  .transform(value => (value === '' ? undefined : value))

export const localeSchema = z.enum(['en', 'sv'])
export type ExportFilenameLocale = z.infer<typeof localeSchema>

export const optionalLocaleQuerySchema = z
  .enum(['en', 'sv'])
  .optional()
  .default('en')

export const queryBooleanSchema = z
  .enum(['true', 'false'])
  .transform(value => value === 'true')

export const queryBooleanStringSchema = z.enum(['true', 'false'])

export const idParamSchema = z
  .object({
    id: positiveIntegerStringSchema,
  })
  .strict()

function formatIssuePath(path: ZodError['issues'][number]['path']): string {
  if (path.length === 0) {
    return '$'
  }

  return path.map(segment => String(segment)).join('.')
}

function toInvalidRequestIssues(error: ZodError): InvalidRequestIssue[] {
  return error.issues.map(issue => ({
    code: issue.code,
    message: issue.message,
    path: formatIssuePath(issue.path),
  }))
}

export function invalidRequestResponse(
  issues: InvalidRequestIssue[],
): NextResponse<InvalidRequestBody> {
  return NextResponse.json(
    {
      error: 'Invalid request',
      issues,
    },
    { status: 400 },
  )
}

export function invalidJsonResponse(): NextResponse<InvalidRequestBody> {
  return invalidRequestResponse([
    {
      code: 'invalid_json',
      message: 'Malformed JSON body',
      path: '$',
    },
  ])
}

export function parseWithSchema<T>(
  schema: ZodType<T>,
  value: unknown,
): ValidationResult<T> {
  const parsed = schema.safeParse(value)
  if (!parsed.success) {
    return {
      ok: false,
      response: invalidRequestResponse(toInvalidRequestIssues(parsed.error)),
    }
  }

  return { data: parsed.data, ok: true }
}

export async function readJsonWithSchema<T>(
  request: Request,
  schema: ZodType<T>,
): Promise<ValidationResult<T>> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return { ok: false, response: invalidJsonResponse() }
  }

  return parseWithSchema(schema, body)
}

export async function parseRouteParams<T>(
  params: Promise<unknown>,
  schema: ZodType<T>,
): Promise<ValidationResult<T>> {
  return parseWithSchema(schema, await params)
}

export function searchParamsToRecord(
  searchParams: URLSearchParams,
): Record<string, string | string[]> {
  const record: Record<string, string | string[]> = {}
  const keys = new Set(searchParams.keys())

  for (const key of keys) {
    const values = searchParams.getAll(key)
    record[key] = values.length === 1 ? (values[0] ?? '') : values
  }

  return record
}

export function parseSearchParams<T>(
  searchParams: URLSearchParams,
  schema: ZodType<T>,
): ValidationResult<T> {
  return parseWithSchema(schema, searchParamsToRecord(searchParams))
}

export function queryArraySchema<T extends ZodType>(
  itemSchema: T,
): ZodType<z.output<T>[]> {
  return z.preprocess(value => {
    if (value === undefined) return []
    return Array.isArray(value) ? value : [value]
  }, z.array(itemSchema).max(ARRAY_INPUT_MAX_ITEMS))
}

export function optionalQueryArraySchema<T extends ZodType>(
  itemSchema: T,
): ZodType<z.output<T>[] | undefined> {
  return z
    .preprocess(value => {
      if (value === undefined) return []
      return Array.isArray(value) ? value : [value]
    }, z.array(itemSchema).max(ARRAY_INPUT_MAX_ITEMS))
    .transform(values => (values.length > 0 ? values : undefined))
}

export function uniquePositiveIntegerArraySchema(): z.ZodArray<
  typeof positiveIntegerSchema
> {
  return z
    .array(positiveIntegerSchema)
    .max(ARRAY_INPUT_MAX_ITEMS)
    .refine(values => new Set(values).size === values.length, {
      message: 'Expected unique positive integers',
    })
}

export function optionalUniquePositiveIntegerArraySchema(): z.ZodOptional<
  z.ZodArray<typeof positiveIntegerSchema>
> {
  return uniquePositiveIntegerArraySchema().optional()
}
