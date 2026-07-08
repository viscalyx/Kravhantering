import type { ZodError } from 'zod'
import type { GenerationStats } from '@/lib/ai/openrouter-client'
import {
  buildRequirementsImportJsonSchema,
  type ImportRequirementsPayload,
} from '@/lib/requirements/import-schema'
import enMessages from '@/messages/en.json'
import svMessages from '@/messages/sv.json'

export const DEFAULT_REQUIREMENT_CANDIDATE_COUNT = 8
export const MIN_REQUIREMENT_CANDIDATE_COUNT = 1
export const MAX_REQUIREMENT_CANDIDATE_COUNT = 25

export interface RequirementImportGenerationResult {
  model: string
  payload: ImportRequirementsPayload
  rawContent: string
  stats: GenerationStats
  thinking: string
}

export interface FormattedSchemaIssue {
  code: string
  message: string
  path: string
}

const PROMPT_MESSAGES = {
  en: enMessages,
  sv: svMessages,
} satisfies Record<'en' | 'sv', Record<string, unknown>>

function promptLocalizationPath(
  locale: 'en' | 'sv',
  path: readonly string[],
): string {
  return `${locale}:${path.join('.')}`
}

function promptValueType(value: unknown): string {
  if (Array.isArray(value)) {
    const itemTypes = [
      ...new Set(value.map(item => promptValueType(item))),
    ].sort()
    return itemTypes.length === 0 ? 'array' : `array<${itemTypes.join('|')}>`
  }
  if (value === null) return 'null'
  return typeof value
}

function missingPromptLocalizationError(
  locale: 'en' | 'sv',
  path: readonly string[],
): Error {
  return new Error(
    `Missing prompt localization for ${promptLocalizationPath(locale, path)}`,
  )
}

function invalidPromptLocalizationTypeError(
  locale: 'en' | 'sv',
  path: readonly string[],
  expected: string,
  actual: unknown,
): Error {
  return new Error(
    `Invalid prompt localization type for ${promptLocalizationPath(
      locale,
      path,
    )}: expected ${expected} but got ${promptValueType(actual)}`,
  )
}

export function getPromptValue(
  locale: 'en' | 'sv',
  path: readonly string[],
): unknown {
  let current: unknown = PROMPT_MESSAGES[locale]

  for (const segment of path) {
    if (
      typeof current !== 'object' ||
      current === null ||
      Array.isArray(current)
    ) {
      throw missingPromptLocalizationError(locale, path)
    }
    const currentRecord = current as Record<string, unknown>
    if (currentRecord[segment] === undefined) {
      throw missingPromptLocalizationError(locale, path)
    }
    current = currentRecord[segment]
  }

  return current
}

export function getPromptMessage(
  locale: 'en' | 'sv',
  path: readonly string[],
): string {
  const current = getPromptValue(locale, path)

  if (typeof current !== 'string') {
    throw invalidPromptLocalizationTypeError(locale, path, 'string', current)
  }

  return current
}

export function getPromptMessageList(
  locale: 'en' | 'sv',
  path: readonly string[],
): string[] {
  const current = getPromptValue(locale, path)

  if (
    !Array.isArray(current) ||
    current.some(item => typeof item !== 'string')
  ) {
    throw invalidPromptLocalizationTypeError(locale, path, 'string[]', current)
  }

  return current
}

export const DEFAULT_INSTRUCTION_EN = getPromptMessage('en', [
  'ai',
  'prompt',
  'defaultInstruction',
])

export const DEFAULT_INSTRUCTION_SV = getPromptMessage('sv', [
  'ai',
  'prompt',
  'defaultInstruction',
])

export function getDefaultInstruction(locale: 'en' | 'sv' = 'en'): string {
  return locale === 'sv' ? DEFAULT_INSTRUCTION_SV : DEFAULT_INSTRUCTION_EN
}

function isJsonSchemaRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function toNullableTypeSchema(
  schema: Record<string, unknown>,
): Record<string, unknown> | null {
  const anyOf = schema.anyOf
  if (!Array.isArray(anyOf)) return null

  const nullSchemas = anyOf.filter(
    item => isJsonSchemaRecord(item) && item.type === 'null',
  )
  const valueSchemas = anyOf.filter(
    item => !(isJsonSchemaRecord(item) && item.type === 'null'),
  )
  if (nullSchemas.length !== 1 || valueSchemas.length !== 1) return null
  const valueSchema = valueSchemas[0]
  if (
    !isJsonSchemaRecord(valueSchema) ||
    typeof valueSchema.type !== 'string'
  ) {
    return null
  }

  const { anyOf: _anyOf, ...schemaWithoutAnyOf } = schema
  const { type, ...valueSchemaWithoutType } = valueSchema
  return {
    ...schemaWithoutAnyOf,
    ...valueSchemaWithoutType,
    type: [type, 'null'],
  }
}

function hasIntegerType(schema: Record<string, unknown>) {
  const { type } = schema
  return (
    type === 'integer' ||
    (Array.isArray(type) && type.some(item => item === 'integer'))
  )
}

function toProviderStringFallbackSchema(
  schema: Record<string, unknown>,
): Record<string, unknown> {
  const { type } = schema
  if (
    Array.isArray(type) &&
    type.length === 2 &&
    type.includes('string') &&
    type.includes('null') &&
    schema.minLength === undefined
  ) {
    return { ...schema, type: 'string' }
  }
  return schema
}

function toStructuredOutputStrictSchema(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(item => toStructuredOutputStrictSchema(item))
  }
  if (!isJsonSchemaRecord(value)) return value

  const nullableSchema = toNullableTypeSchema(value)
  const schema = toProviderStringFallbackSchema(nullableSchema ?? value)
  const result: Record<string, unknown> = {}
  const stripIntegerRange = hasIntegerType(schema)

  for (const [key, item] of Object.entries(schema)) {
    if (key === '$schema') continue
    if (stripIntegerRange && (key === 'maximum' || key === 'minimum')) {
      continue
    }
    if (key === 'const') {
      result.enum = [item]
      continue
    }
    result[key] = toStructuredOutputStrictSchema(item)
  }

  if (isJsonSchemaRecord(result.properties)) {
    const properties = result.properties
    result.required = Object.keys(properties)
    result.additionalProperties = false
  }

  return result
}

export function buildRequirementImportResponseFormatSchema(
  locale: 'en' | 'sv' = 'en',
): Record<string, unknown> {
  return toStructuredOutputStrictSchema(
    buildRequirementsImportJsonSchema(locale),
  ) as Record<string, unknown>
}

export function buildRequirementImportSystemPrompt(
  importInstruction: string,
  locale: 'en' | 'sv' = 'en',
): string {
  const systemIntro = getPromptMessage(locale, [
    'ai',
    'prompt',
    'system',
    'intro',
  ])
  const importHeading = getPromptMessage(locale, [
    'ai',
    'prompt',
    'system',
    'importContractHeading',
  ])

  return `${systemIntro}

${importHeading}

${importInstruction}`
}

export interface BuildRequirementImportUserPromptOptions {
  count?: number
  locale?: 'en' | 'sv'
  need: string
}

export function clampRequirementCandidateCount(count: number): number {
  if (!Number.isFinite(count)) return DEFAULT_REQUIREMENT_CANDIDATE_COUNT
  return Math.min(
    MAX_REQUIREMENT_CANDIDATE_COUNT,
    Math.max(MIN_REQUIREMENT_CANDIDATE_COUNT, Math.trunc(count)),
  )
}

export function buildRequirementImportUserPrompt({
  count = DEFAULT_REQUIREMENT_CANDIDATE_COUNT,
  locale = 'en',
  need,
}: BuildRequirementImportUserPromptOptions): string {
  const candidateCount = clampRequirementCandidateCount(count)
  const userHeader = getPromptMessage(locale, ['ai', 'prompt', 'userHeader'])
  const countLabel = getPromptMessage(locale, ['ai', 'prompt', 'countLabel'])
  const instructionHeader = getPromptMessage(locale, [
    'ai',
    'prompt',
    'instructionHeader',
  ])
  const instruction = getDefaultInstruction(locale)

  return [
    `${instructionHeader}
${instruction}`,
    `${userHeader}
${need.trim()}`,
    `${countLabel}
${candidateCount}`,
  ].join('\n\n')
}

export interface BuildRequirementImportRepairPromptOptions {
  brokenJson: string
  errors: readonly string[]
  locale?: 'en' | 'sv'
}

function sanitizeRequirementImportRepairInput(rawInput: string): string {
  const trimmed = rawInput.trim()
  const fenceMatch = trimmed.match(/^```[^\r\n`]*\r?\n([\s\S]*?)\r?\n```$/)
  return fenceMatch?.[1]?.trim() ?? trimmed
}

export function buildRequirementImportRepairPrompt({
  brokenJson,
  errors,
  locale = 'en',
}: BuildRequirementImportRepairPromptOptions): string {
  const intro = getPromptMessage(locale, ['ai', 'prompt', 'repair', 'intro'])
  const rules = getPromptMessageList(locale, [
    'ai',
    'prompt',
    'repair',
    'rules',
  ])
  const errorHeading = getPromptMessage(locale, [
    'ai',
    'prompt',
    'repair',
    'errorHeading',
  ])
  const jsonHeading = getPromptMessage(locale, [
    'ai',
    'prompt',
    'repair',
    'jsonHeading',
  ])
  const formattedErrors =
    errors.length > 0
      ? errors.map(error => `- ${error}`).join('\n')
      : `- ${getPromptMessage(locale, [
          'ai',
          'prompt',
          'repair',
          'defaultValidationError',
        ])}`
  const encodedBrokenJson = JSON.stringify(
    {
      invalidJsonPayload: sanitizeRequirementImportRepairInput(brokenJson),
    },
    null,
    2,
  )

  return `${intro}

${rules.map(rule => `- ${rule}`).join('\n')}

${errorHeading}
${formattedErrors}

${jsonHeading}
${encodedBrokenJson}`
}

function formatIssuePath(path: ZodError['issues'][number]['path']): string {
  if (path.length === 0) return '$'
  return path.map(segment => String(segment)).join('.')
}

export function formatSchemaIssues(error: ZodError): FormattedSchemaIssue[] {
  return error.issues.map(issue => ({
    code: issue.code,
    message: issue.message,
    path: formatIssuePath(issue.path),
  }))
}

export function parseJsonObject(rawContent: string): unknown {
  return JSON.parse(rawContent)
}
