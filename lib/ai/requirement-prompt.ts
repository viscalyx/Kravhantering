import type { ZodError } from 'zod'
import type { AppLocale } from '@/lib/locale-preference'
import {
  DEFAULT_REQUIREMENT_IMPORT_BUDGET,
  type RequirementImportBudget,
} from '@/lib/requirements/import-budget'
import {
  type FormattedRequirementImportJsonErrors,
  REQUIREMENT_IMPORT_REPAIR_PROMPT_ERROR_LIMIT,
} from '@/lib/requirements/import-json-errors'
import {
  buildRequirementsImportJsonSchema,
  REQUIREMENTS_IMPORT_SCHEMA_VERSION,
} from '@/lib/requirements/import-schema'
import enMessages from '@/messages/en.json'
import svMessages from '@/messages/sv.json'

export const DEFAULT_REQUIREMENT_CANDIDATE_COUNT = 8
export const MIN_REQUIREMENT_CANDIDATE_COUNT = 1
export const MAX_REQUIREMENT_CANDIDATE_COUNT = 25
export const SAFE_AI_TECHNICAL_CODE = /^[a-z][a-z0-9_.:-]{0,79}$/u

export interface FormattedSchemaIssue {
  code: string
  message: string
  path: string
}

const PROMPT_MESSAGES = {
  en: enMessages,
  sv: svMessages,
} satisfies Record<AppLocale, Record<string, unknown>>

function promptLocalizationPath(
  locale: AppLocale,
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
  locale: AppLocale,
  path: readonly string[],
): Error {
  return new Error(
    `Missing prompt localization for ${promptLocalizationPath(locale, path)}`,
  )
}

function invalidPromptLocalizationTypeError(
  locale: AppLocale,
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
  locale: AppLocale,
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
  locale: AppLocale,
  path: readonly string[],
): string {
  const current = getPromptValue(locale, path)

  if (typeof current !== 'string') {
    throw invalidPromptLocalizationTypeError(locale, path, 'string', current)
  }

  return current
}

export function getPromptMessageList(
  locale: AppLocale,
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

/**
 * One prompt rule. A string is a top-level rule; an array holds the sub-rules
 * of the preceding top-level rule.
 */
export type PromptRuleItem = string | readonly string[]

export function getPromptRuleList(
  locale: AppLocale,
  path: readonly string[],
): PromptRuleItem[] {
  const current = getPromptValue(locale, path)

  if (
    !Array.isArray(current) ||
    current.some(
      item =>
        typeof item !== 'string' &&
        !(
          Array.isArray(item) &&
          item.length > 0 &&
          item.every(subItem => typeof subItem === 'string')
        ),
    )
  ) {
    throw invalidPromptLocalizationTypeError(
      locale,
      path,
      'Array<string | string[]>',
      current,
    )
  }

  return current as PromptRuleItem[]
}

const PROMPT_PLACEHOLDER_PATTERN = /\{([A-Za-z][A-Za-z0-9]*)\}/gu

/**
 * Replaces `{name}` value placeholders in a prompt text. Prompt texts are not
 * read through next-intl formatting, so every placeholder must have a value.
 */
function fillPromptPlaceholders(
  text: string,
  values: Readonly<Record<string, number | string>>,
): string {
  return text.replace(PROMPT_PLACEHOLDER_PATTERN, (_match, name: string) => {
    const value = values[name]
    if (value === undefined) {
      throw new Error(`Missing prompt placeholder value for {${name}}`)
    }
    return String(value)
  })
}

function renderPromptRuleList(
  items: readonly PromptRuleItem[],
  values: Readonly<Record<string, number | string>> = {},
): string {
  return items
    .flatMap(item =>
      typeof item === 'string'
        ? [`- ${fillPromptPlaceholders(item, values)}`]
        : item.map(subItem => `  - ${fillPromptPlaceholders(subItem, values)}`),
    )
    .join('\n')
}

export type RequirementImportDestinationKind =
  | 'requirements_library'
  | 'requirements_specification'

/** Shared part: the channel-neutral role intro. */
export function buildRequirementImportRoleIntro(
  locale: AppLocale = 'en',
): string {
  return getPromptMessage(locale, ['ai', 'prompt', 'system', 'intro'])
}

/** Shared part: the rule order that ranks schema, instructions, and input. */
export function buildRequirementImportRuleOrder(
  locale: AppLocale = 'en',
): string {
  const intro = getPromptMessage(locale, ['ai', 'prompt', 'ruleOrder', 'intro'])
  const items = getPromptMessageList(locale, [
    'ai',
    'prompt',
    'ruleOrder',
    'items',
  ])

  return [intro, ...items.map((item, index) => `${index + 1}. ${item}`)].join(
    '\n',
  )
}

/** Shared part: the app-owned AI instruction (author rules for candidates). */
export function buildRequirementImportAiInstruction(
  locale: AppLocale = 'en',
): string {
  return getPromptMessage(locale, ['ai', 'prompt', 'defaultInstruction'])
}

/**
 * The inputs of the import instruction rules. The AI request template takes
 * the same inputs, since it embeds those rules without reference data.
 */
export interface BuildRequirementImportInstructionRulesOptions {
  budget: RequirementImportBudget
  destinationKind: RequirementImportDestinationKind
  locale: AppLocale
}

function importInstructionMessage(locale: AppLocale, key: string): string {
  return getPromptMessage(locale, ['ai', 'prompt', 'importInstruction', key])
}

function importInstructionRules(
  locale: AppLocale,
  key: string,
): PromptRuleItem[] {
  return getPromptRuleList(locale, ['ai', 'prompt', 'importInstruction', key])
}

/**
 * Shared part: the import instruction rules for one destination kind, without
 * the title and without reference data.
 */
export function buildRequirementImportInstructionRules({
  budget,
  destinationKind,
  locale,
}: BuildRequirementImportInstructionRulesOptions): string {
  const values = {
    maxJsonDepth: budget.maxJsonDepth,
    maxNestedItems: budget.maxNestedItems,
    maxProposedNeedsReferences: budget.maxProposedNeedsReferences,
    maxProposedNormReferences: budget.maxProposedNormReferences,
    maxRows: budget.maxRows,
    schemaVersion: REQUIREMENTS_IMPORT_SCHEMA_VERSION,
  }
  const needsReferenceRules = importInstructionRules(
    locale,
    destinationKind === 'requirements_specification'
      ? 'specificationNeedsReferences'
      : 'libraryNeedsReferences',
  )

  return [
    `## ${importInstructionMessage(locale, 'rulesHeading')}`,
    renderPromptRuleList(importInstructionRules(locale, 'rules'), values),
    `## ${importInstructionMessage(locale, 'conflictsHeading')}`,
    renderPromptRuleList(importInstructionRules(locale, 'conflicts'), values),
    `## ${importInstructionMessage(locale, 'fieldSelectionHeading')}`,
    renderPromptRuleList(
      [
        ...importInstructionRules(locale, 'fieldSelection'),
        ...needsReferenceRules,
        ...importInstructionRules(locale, 'fieldSelectionAfterNeedsReferences'),
      ],
      values,
    ),
  ].join('\n\n')
}

export interface BuildRequirementImportInstructionOptions
  extends BuildRequirementImportInstructionRulesOptions {
  /** The destination's reference data object, built on the server. */
  referenceData: Readonly<Record<string, unknown>>
}

/**
 * The standalone import instruction: title, the shared rules part, and the
 * indented reference data. Used by the internal AI request, REST, and MCP.
 */
export function buildRequirementImportInstruction({
  referenceData,
  ...ruleOptions
}: BuildRequirementImportInstructionOptions): string {
  const { locale } = ruleOptions

  return [
    `# ${importInstructionMessage(locale, 'title')}`,
    '',
    buildRequirementImportInstructionRules(ruleOptions),
    '',
    `## ${importInstructionMessage(locale, 'referenceDataHeading')}`,
    '',
    '```json',
    JSON.stringify(referenceData, null, 2),
    '```',
  ].join('\n')
}

/** Shared part: the repair rules as a Markdown list. */
export function buildRequirementImportRepairRules(
  locale: AppLocale = 'en',
): string {
  return renderPromptRuleList(
    getPromptMessageList(locale, ['ai', 'prompt', 'repair', 'rules']),
  )
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
    if (key === '$schema' || key.startsWith('x-')) continue
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
  locale: AppLocale = 'en',
  budget: RequirementImportBudget = DEFAULT_REQUIREMENT_IMPORT_BUDGET,
): Record<string, unknown> {
  return toStructuredOutputStrictSchema(
    buildRequirementsImportJsonSchema(locale, budget),
  ) as Record<string, unknown>
}

/**
 * Internal composer: the system message of the internal AI request, the repair
 * request, and the AI request explanation dialog.
 */
export function buildRequirementImportSystemPrompt(
  importInstruction: string,
  locale: AppLocale = 'en',
): string {
  const importHeading = getPromptMessage(locale, [
    'ai',
    'prompt',
    'system',
    'importContractHeading',
  ])

  return [
    buildRequirementImportRoleIntro(locale),
    buildRequirementImportRuleOrder(locale),
    importHeading,
    importInstruction,
  ].join('\n\n')
}

function templateMessage(locale: AppLocale, key: string): string {
  return getPromptMessage(locale, ['ai', 'prompt', 'template', key])
}

function templateList(locale: AppLocale, key: string): string[] {
  return getPromptMessageList(locale, ['ai', 'prompt', 'template', key])
}

/**
 * Template composer: the AI request in portable form for an external AI
 * assistant. It uses the same shared parts as the internal composer, never
 * embeds reference data (the user attaches the reference data file), and
 * embeds the same minified schema as the schema download.
 */
export function buildRequirementImportAiRequestTemplate({
  budget,
  destinationKind,
  locale,
}: BuildRequirementImportInstructionRulesOptions): string {
  const values = {
    defaultCount: DEFAULT_REQUIREMENT_CANDIDATE_COUNT,
    destinationKind,
    destinationLabel: getPromptMessage(locale, [
      'ai',
      'prompt',
      'template',
      'destinationLabels',
      destinationKind,
    ]),
    maxRows: budget.maxRows,
    schemaVersion: REQUIREMENTS_IMPORT_SCHEMA_VERSION,
  }
  const section = (headingKey: string, ...body: string[]) =>
    [`# ${templateMessage(locale, headingKey)}`, ...body].join('\n\n')

  return `${[
    templateMessage(locale, 'startMarker'),
    buildRequirementImportRoleIntro(locale),
    buildRequirementImportRuleOrder(locale),
    section(
      'inputHeading',
      renderPromptRuleList(templateList(locale, 'input'), values),
    ),
    section(
      'checksHeading',
      [
        templateMessage(locale, 'checksIntro'),
        renderPromptRuleList(templateList(locale, 'checks'), values),
      ].join('\n'),
    ),
    section(
      'countHeading',
      renderPromptRuleList(templateList(locale, 'count'), values),
    ),
    section(
      'aiInstructionHeading',
      buildRequirementImportAiInstruction(locale),
    ),
    section(
      'importInstructionHeading',
      buildRequirementImportInstructionRules({
        budget,
        destinationKind,
        locale,
      }),
    ),
    section(
      'schemaHeading',
      templateMessage(locale, 'schemaContract'),
      [
        '```json',
        JSON.stringify(buildRequirementsImportJsonSchema(locale, budget)),
        '```',
      ].join('\n'),
    ),
    templateMessage(locale, 'endMarker'),
  ].join('\n\n')}\n`
}

export interface BuildRequirementImportUserPromptOptions {
  count?: number
  locale?: AppLocale
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
  const instruction = buildRequirementImportAiInstruction(locale)

  return [
    `${instructionHeader}
${instruction}`,
    `${userHeader}
${need.trim()}`,
    `${countLabel}
${candidateCount}`,
  ].join('\n\n')
}

export interface BuildRequirementImportRepairUserPromptOptions {
  brokenJson: string
  errors: readonly string[]
  locale?: AppLocale
}

function sanitizeRequirementImportRepairInput(rawInput: string): string {
  const trimmed = rawInput.trim()
  const fenceMatch = trimmed.match(/^```[^\r\n`]*\r?\n([\s\S]*?)\r?\n```$/)
  return fenceMatch?.[1]?.trim() ?? trimmed
}

/**
 * The user message of the internal repair request. It carries the broken JSON
 * as a JSON string value, so the model sees it as data.
 */
export function buildRequirementImportRepairUserPrompt({
  brokenJson,
  errors,
  locale = 'en',
}: BuildRequirementImportRepairUserPromptOptions): string {
  const intro = getPromptMessage(locale, ['ai', 'prompt', 'repair', 'intro'])
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

${buildRequirementImportRepairRules(locale)}

${errorHeading}
${formattedErrors}

${jsonHeading}
${encodedBrokenJson}`
}

export interface BuildRequirementImportRepairPromptOptions {
  /**
   * Errors from `formatRequirementImportJsonErrors`, preferably capped at
   * `REQUIREMENT_IMPORT_REPAIR_PROMPT_ERROR_LIMIT`.
   */
  errors: FormattedRequirementImportJsonErrors
  locale: AppLocale
}

/**
 * The repair prompt for an external AI assistant. The import dialog builds it
 * when pasted JSON does not validate, and the user pastes it into the same
 * conversation. It holds a follow-up intro, the shared repair rules, and at
 * most 50 errors, but no JSON, no template, and no schema.
 */
export function buildRequirementImportRepairPrompt({
  errors,
  locale,
}: BuildRequirementImportRepairPromptOptions): string {
  const repairMessage = (key: string) =>
    getPromptMessage(locale, ['ai', 'prompt', 'repair', key])
  const listedErrors = errors.errors.slice(
    0,
    REQUIREMENT_IMPORT_REPAIR_PROMPT_ERROR_LIMIT,
  )
  const omittedCount =
    errors.omittedCount + errors.errors.length - listedErrors.length

  return [
    repairMessage('externalIntro'),
    buildRequirementImportRepairRules(locale),
    [
      repairMessage('errorHeading'),
      ...listedErrors.map(error => `- ${error.path}: ${error.message}`),
    ].join('\n'),
    ...(omittedCount > 0
      ? [
          fillPromptPlaceholders(
            repairMessage(omittedCount === 1 ? 'moreErrorsOne' : 'moreErrors'),
            { count: omittedCount },
          ),
        ]
      : []),
  ].join('\n\n')
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
  try {
    return JSON.parse(rawContent)
  } catch {
    const fenced = rawContent.match(/```(?:json)?\s*([\s\S]*?)\s*```/iu)?.[1]
    if (fenced) return JSON.parse(fenced)

    const start = rawContent.indexOf('{')
    let depth = 0
    let escaped = false
    let inString = false
    for (
      let index = start;
      index >= 0 && index < rawContent.length;
      index += 1
    ) {
      const character = rawContent[index]
      if (inString) {
        if (escaped) escaped = false
        else if (character === '\\') escaped = true
        else if (character === '"') inString = false
        continue
      }
      if (character === '"') {
        inString = true
      } else if (character === '{') {
        depth += 1
      } else if (character === '}') {
        depth -= 1
        if (depth === 0) return JSON.parse(rawContent.slice(start, index + 1))
      }
    }
    return JSON.parse(rawContent)
  }
}
