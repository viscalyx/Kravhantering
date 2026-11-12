import type {
  ImportJsonProblem,
  ImportJsonSchemaIssue,
} from '@/lib/requirements/import-json-input'

/**
 * Formats import JSON problems into short, translated texts with JSON paths.
 * The formatter is pure and client-safe. Callers choose the cap, for example
 * the import dialog's list next to the JSON field or a repair prompt.
 */

/** The most errors the import dialog lists next to the JSON field. */
export const REQUIREMENT_IMPORT_JSON_DIALOG_ERROR_LIMIT = 20

/** The most errors a repair prompt for an external AI assistant lists. */
export const REQUIREMENT_IMPORT_REPAIR_PROMPT_ERROR_LIMIT = 50

/**
 * Translates keys in the `requirementsImportJson` message namespace. A
 * `useTranslations('requirementsImportJson')` or `createTranslator` function
 * with that namespace fits this signature.
 */
export type RequirementImportJsonTranslator = (
  key: string,
  values?: Record<string, number | string>,
) => string

export interface FormattedRequirementImportJsonError {
  message: string
  /** JSON path from the document root, for example `$.requirements[0].description`. */
  path: string
}

export interface FormattedRequirementImportJsonErrors {
  errors: FormattedRequirementImportJsonError[]
  /** Number of errors left out because of the cap. */
  omittedCount: number
}

export interface FormatRequirementImportJsonErrorsOptions {
  /** The most errors to return. */
  limit: number
  t: RequirementImportJsonTranslator
}

const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/u
const VALUE_TYPE_KEYS = new Set([
  'array',
  'boolean',
  'int',
  'null',
  'number',
  'object',
  'string',
])

export function formatRequirementImportJsonPath(
  path: readonly (number | string)[],
): string {
  return path.reduce<string>((result, segment) => {
    if (typeof segment === 'number') return `${result}[${segment}]`
    return IDENTIFIER.test(segment)
      ? `${result}.${segment}`
      : `${result}[${JSON.stringify(segment)}]`
  }, '$')
}

function valueTypeLabel(
  type: string | undefined,
  t: RequirementImportJsonTranslator,
): string {
  return t(`valueType.${type && VALUE_TYPE_KEYS.has(type) ? type : 'unknown'}`)
}

function sizeIssueMessage(
  issue: ImportJsonSchemaIssue,
  t: RequirementImportJsonTranslator,
): string {
  const tooSmall = issue.code === 'too_small'
  const minimum = issue.minimum ?? 0
  const maximum = issue.maximum ?? 0
  switch (issue.origin) {
    case 'string':
      if (tooSmall) {
        return minimum <= 1
          ? t('issue.stringEmpty')
          : t('issue.stringTooShort', { minimum })
      }
      return t('issue.stringTooLong', { maximum })
    case 'array':
    case 'set':
      return tooSmall
        ? t('issue.arrayTooShort', { minimum })
        : t('issue.arrayTooLong', { maximum })
    case 'number':
    case 'int':
    case 'bigint':
      if (tooSmall) {
        return issue.inclusive === false
          ? t('issue.numberNotAbove', { minimum })
          : t('issue.numberTooSmall', { minimum })
      }
      return issue.inclusive === false
        ? t('issue.numberNotBelow', { maximum })
        : t('issue.numberTooBig', { maximum })
    default:
      return t('issue.invalid')
  }
}

function schemaIssueMessage(
  issue: ImportJsonSchemaIssue,
  t: RequirementImportJsonTranslator,
): string {
  switch (issue.code) {
    case 'invalid_type':
      return issue.received === 'missing'
        ? t('issue.required')
        : t('issue.invalidType', {
            expected: valueTypeLabel(issue.expected, t),
            received: valueTypeLabel(issue.received, t),
          })
    case 'too_small':
    case 'too_big':
      return sizeIssueMessage(issue, t)
    case 'invalid_value':
      return t('issue.invalidValue', {
        values: (issue.values ?? [])
          .map(value => JSON.stringify(value))
          .join(', '),
      })
    case 'invalid_format':
      return t('issue.invalidFormat')
    case 'custom':
      if (issue.message === 'import_json_depth_cap_exceeded') {
        return t('issue.jsonTooDeep')
      }
      return issue.message.startsWith('Expected unique')
        ? t('issue.duplicateKey')
        : t('issue.invalid')
    default:
      return t('issue.invalid')
  }
}

function schemaIssueErrors(
  issues: readonly ImportJsonSchemaIssue[],
  t: RequirementImportJsonTranslator,
): FormattedRequirementImportJsonError[] {
  return issues.flatMap(issue => {
    if (issue.code === 'unrecognized_keys' && issue.keys?.length) {
      return issue.keys.map(key => ({
        message: t('issue.unknownField'),
        path: formatRequirementImportJsonPath([...issue.path, key]),
      }))
    }
    return [
      {
        message: schemaIssueMessage(issue, t),
        path: formatRequirementImportJsonPath(issue.path),
      },
    ]
  })
}

function syntaxDetail(
  problem: Extract<ImportJsonProblem, { kind: 'syntax' }>,
  t: RequirementImportJsonTranslator,
): string {
  switch (problem.reason) {
    case 'unexpected-character':
      return problem.character === null
        ? t('syntaxDetail.unknown')
        : t('syntaxDetail.unexpectedCharacter', {
            character: problem.character,
          })
    case 'unexpected-end':
      return t('syntaxDetail.unexpectedEnd')
    case 'invalid-string':
      return t('syntaxDetail.invalidString')
    default:
      return t('syntaxDetail.unknown')
  }
}

/**
 * Describes an import JSON problem in one sentence. For schema problems, the
 * sentence introduces the error list from
 * `formatRequirementImportJsonErrors`.
 */
export function describeRequirementImportJsonProblem(
  problem: ImportJsonProblem,
  t: RequirementImportJsonTranslator,
): string {
  switch (problem.kind) {
    case 'no-json':
      return t('noJson')
    case 'truncated':
      return t('truncated')
    case 'multiple-code-blocks':
      return t('multipleCodeBlocks', { count: problem.codeBlockCount })
    case 'syntax':
      return problem.location
        ? t('syntaxErrorAt', {
            column: problem.location.column,
            detail: syntaxDetail(problem, t),
            line: problem.location.line,
          })
        : t('syntaxError', { detail: syntaxDetail(problem, t) })
    case 'wrong-version':
      return t('wrongSchemaVersion', { version: problem.expectedVersion })
    case 'schema':
      return t('schemaInvalid', {
        count: schemaIssueErrors(problem.issues, t).length,
      })
  }
}

/**
 * Reports whether the import dialog offers a repair prompt for the problem:
 * syntax errors, a wrong `schemaVersion`, and schema errors. A response
 * without JSON, truncated JSON, or several code blocks gets a hint instead.
 */
export function isRequirementImportJsonProblemRepairable(
  problem: ImportJsonProblem,
): boolean {
  return (
    problem.kind === 'syntax' ||
    problem.kind === 'wrong-version' ||
    problem.kind === 'schema'
  )
}

/**
 * Lists the errors that a user or an AI assistant can fix in the JSON: one
 * error for a syntax error or a wrong `schemaVersion`, and one error per
 * schema issue. Other problems have no error list.
 */
export function formatRequirementImportJsonErrors(
  problem: ImportJsonProblem,
  { limit, t }: FormatRequirementImportJsonErrorsOptions,
): FormattedRequirementImportJsonErrors {
  let errors: FormattedRequirementImportJsonError[]
  switch (problem.kind) {
    case 'syntax':
      errors = [
        {
          message: describeRequirementImportJsonProblem(problem, t),
          path: '$',
        },
      ]
      break
    case 'wrong-version':
      errors = [
        {
          message: describeRequirementImportJsonProblem(problem, t),
          path: formatRequirementImportJsonPath(['schemaVersion']),
        },
      ]
      break
    case 'schema':
      errors = schemaIssueErrors(problem.issues, t)
      break
    default:
      errors = []
  }
  const cap = Math.max(0, Math.floor(limit))
  return {
    errors: errors.slice(0, cap),
    omittedCount: Math.max(0, errors.length - cap),
  }
}
