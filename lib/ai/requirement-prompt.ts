/**
 * System prompt builder for AI requirement generation.
 * Produces prompts grounded in ISO/IEC/IEEE 29148:2018, ISO/IEC 25030:2019,
 * and ISO/IEC 25010:2023 standards.
 */

import type { GenerationStats } from '@/lib/ai/openrouter-client'
import enMessages from '@/messages/en.json'
import svMessages from '@/messages/sv.json'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GeneratedRequirement {
  acceptanceCriteria?: string
  categoryId?: number
  description: string
  qualityCharacteristicId?: number
  rationale: string
  requirementPackageIds?: number[]
  requiresTesting: boolean
  riskLevelId?: number
  typeId: number
  verificationMethod?: string
}

export interface GenerationResult {
  model: string
  requirements: GeneratedRequirement[]
  stats: GenerationStats
  thinking: string
}

export interface TaxonomyData {
  categories: Array<{ id: number; name: string }>
  qualityCharacteristics: Array<{
    id: number
    name: string
    parentName?: string
  }>
  requirementPackages: Array<{ id: number; name: string }>
  riskLevels: Array<{ id: number; name: string }>
  types: Array<{ id: number; name: string }>
}

// ---------------------------------------------------------------------------
// JSON schema for OpenRouter `response_format` parameter
// ---------------------------------------------------------------------------

export const REQUIREMENT_FORMAT_SCHEMA: Record<string, unknown> = {
  properties: {
    requirements: {
      items: {
        properties: {
          acceptanceCriteria: { type: ['string', 'null'] },
          categoryId: { type: ['integer', 'null'] },
          description: { type: 'string' },
          qualityCharacteristicId: { type: ['integer', 'null'] },
          rationale: { type: 'string' },
          requiresTesting: { type: 'boolean' },
          riskLevelId: { type: ['integer', 'null'] },
          requirementPackageIds: {
            items: { type: 'integer' },
            type: ['array', 'null'],
          },
          typeId: { type: 'integer' },
          verificationMethod: { type: ['string', 'null'] },
        },
        required: [
          'acceptanceCriteria',
          'categoryId',
          'description',
          'qualityCharacteristicId',
          'rationale',
          'requiresTesting',
          'riskLevelId',
          'requirementPackageIds',
          'typeId',
          'verificationMethod',
        ],
        additionalProperties: false,
        type: 'object',
      },
      type: 'array',
    },
  },
  required: ['requirements'],
  additionalProperties: false,
  type: 'object',
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

const SYSTEM_PROMPT_HEADING_KEYS = [
  'types',
  'categories',
  'qualityCharacteristics',
  'riskLevels',
  'requirementPackages',
  'outputRules',
] as const

type SystemPromptHeadingKey = (typeof SYSTEM_PROMPT_HEADING_KEYS)[number]
type SystemPromptHeadings = Record<SystemPromptHeadingKey, string>

function getSystemPromptHeadings(locale: 'en' | 'sv'): SystemPromptHeadings {
  const path = ['ai', 'prompt', 'system', 'headings'] as const
  const current = getPromptValue(locale, path)

  if (
    typeof current !== 'object' ||
    current === null ||
    Array.isArray(current)
  ) {
    throw invalidPromptLocalizationTypeError(
      locale,
      path,
      'record<string,string>',
      current,
    )
  }

  const currentRecord = current as Record<string, unknown>
  const headings: Partial<SystemPromptHeadings> = {}
  for (const key of SYSTEM_PROMPT_HEADING_KEYS) {
    const heading = currentRecord[key]
    if (typeof heading !== 'string') {
      throw invalidPromptLocalizationTypeError(
        locale,
        [...path, key],
        'string',
        heading,
      )
    }
    headings[key] = heading
  }

  return headings as SystemPromptHeadings
}

// ---------------------------------------------------------------------------
// Default instruction constant
// ---------------------------------------------------------------------------

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

/** @deprecated Use DEFAULT_INSTRUCTION_EN instead */
export const DEFAULT_INSTRUCTION = DEFAULT_INSTRUCTION_EN

export function getDefaultInstruction(locale: 'en' | 'sv' = 'en'): string {
  return getPromptMessage(locale, ['ai', 'prompt', 'defaultInstruction'])
}

// ---------------------------------------------------------------------------
// Prompt builder
// ---------------------------------------------------------------------------

export function buildSystemPrompt(
  taxonomy: TaxonomyData,
  locale: 'en' | 'sv' = 'en',
): string {
  const headings = getSystemPromptHeadings(locale)
  const typeList = taxonomy.types
    .map(t => `  - ID ${t.id}: ${t.name}`)
    .join('\n')
  const catList = taxonomy.categories
    .map(c => `  - ID ${c.id}: ${c.name}`)
    .join('\n')
  const riskList = taxonomy.riskLevels
    .map(r => `  - ID ${r.id}: ${r.name}`)
    .join('\n')
  const requirementPackageList =
    taxonomy.requirementPackages.length > 0
      ? taxonomy.requirementPackages
          .map(s => `  - ID ${s.id}: ${s.name}`)
          .join('\n')
      : `_${getPromptMessage(locale, [
          'ai',
          'prompt',
          'noRequirementPackagesAvailable',
        ])}_`
  const outputRules = getPromptMessageList(locale, [
    'ai',
    'prompt',
    'system',
    'outputRules',
  ])
    .map(rule => `- ${rule}`)
    .join('\n')

  const qcList = taxonomy.qualityCharacteristics
    .map(
      qc =>
        `  - ID ${qc.id}: ${qc.parentName ? `${qc.parentName} > ` : ''}${qc.name}`,
    )
    .join('\n')

  return `${getPromptMessage(locale, ['ai', 'prompt', 'system', 'intro'])}

${getPromptMessage(locale, ['ai', 'prompt', 'system', 'taxonomyIntro'])}

## ${headings.types}
${typeList}

## ${headings.categories}
${catList}

## ${headings.qualityCharacteristics}
${qcList}

## ${headings.riskLevels}
${riskList}

## ${headings.requirementPackages}
${requirementPackageList}

## ${headings.outputRules}
${outputRules}`
}

export function buildUserPrompt(
  topic: string,
  customInstruction?: string,
  locale?: 'en' | 'sv',
): string {
  const instruction = customInstruction?.trim() || getDefaultInstruction(locale)
  const header = getPromptMessage(locale ?? 'en', [
    'ai',
    'prompt',
    'userHeader',
  ])
  return `${instruction}

## ${header}
${topic}`
}

// ---------------------------------------------------------------------------
// Validation: filter requirements with invalid taxonomy IDs
// ---------------------------------------------------------------------------

export function validateGeneratedRequirements(
  requirements: GeneratedRequirement[],
  taxonomy: TaxonomyData,
): GeneratedRequirement[] {
  const validTypeIds = new Set(taxonomy.types.map(t => t.id))
  const validCatIds = new Set(taxonomy.categories.map(c => c.id))
  const validQcIds = new Set(taxonomy.qualityCharacteristics.map(qc => qc.id))
  const validRiskIds = new Set(taxonomy.riskLevels.map(r => r.id))
  const validRequirementPackageIds = new Set(
    taxonomy.requirementPackages.map(s => s.id),
  )

  return requirements
    .filter(r => validTypeIds.has(r.typeId))
    .map(r => ({
      ...r,
      categoryId:
        r.categoryId && validCatIds.has(r.categoryId)
          ? r.categoryId
          : undefined,
      qualityCharacteristicId:
        r.qualityCharacteristicId && validQcIds.has(r.qualityCharacteristicId)
          ? r.qualityCharacteristicId
          : undefined,
      riskLevelId:
        r.riskLevelId && validRiskIds.has(r.riskLevelId)
          ? r.riskLevelId
          : undefined,
      requirementPackageIds: r.requirementPackageIds?.filter(id =>
        validRequirementPackageIds.has(id),
      ),
    }))
}
