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
  requiresTesting: boolean
  riskLevelId?: number
  scenarioIds?: number[]
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
  riskLevels: Array<{ id: number; name: string }>
  scenarios: Array<{ id: number; name: string }>
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
          scenarioIds: {
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
          'scenarioIds',
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

function getPromptValue(locale: 'en' | 'sv', path: readonly string[]): unknown {
  let current: unknown = PROMPT_MESSAGES[locale]

  for (const segment of path) {
    if (
      typeof current !== 'object' ||
      current === null ||
      Array.isArray(current)
    ) {
      throw new Error(
        `Missing prompt localization for ${locale}:${path.join('.')}`,
      )
    }
    current = (current as Record<string, unknown>)[segment]
  }

  return current
}

function getPromptMessage(
  locale: 'en' | 'sv',
  path: readonly string[],
): string {
  const current = getPromptValue(locale, path)

  if (typeof current !== 'string') {
    throw new Error(
      `Missing prompt localization for ${locale}:${path.join('.')}`,
    )
  }

  return current
}

function getPromptMessageList(
  locale: 'en' | 'sv',
  path: readonly string[],
): string[] {
  const current = getPromptValue(locale, path)

  if (
    !Array.isArray(current) ||
    current.some(item => typeof item !== 'string')
  ) {
    throw new Error(
      `Missing prompt localization for ${locale}:${path.join('.')}`,
    )
  }

  return current
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
  const typeList = taxonomy.types
    .map(t => `  - ID ${t.id}: ${t.name}`)
    .join('\n')
  const catList = taxonomy.categories
    .map(c => `  - ID ${c.id}: ${c.name}`)
    .join('\n')
  const riskList = taxonomy.riskLevels
    .map(r => `  - ID ${r.id}: ${r.name}`)
    .join('\n')
  const scenarioList =
    taxonomy.scenarios.length > 0
      ? taxonomy.scenarios.map(s => `  - ID ${s.id}: ${s.name}`).join('\n')
      : `  - ${getPromptMessage(locale, [
          'ai',
          'prompt',
          'noUsageScenariosAvailable',
        ])}`
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

## ${getPromptMessage(locale, ['ai', 'prompt', 'system', 'headings', 'types'])}
${typeList}

## ${getPromptMessage(locale, [
    'ai',
    'prompt',
    'system',
    'headings',
    'categories',
  ])}
${catList}

## ${getPromptMessage(locale, [
    'ai',
    'prompt',
    'system',
    'headings',
    'qualityCharacteristics',
  ])}
${qcList}

## ${getPromptMessage(locale, [
    'ai',
    'prompt',
    'system',
    'headings',
    'riskLevels',
  ])}
${riskList}

## ${getPromptMessage(locale, [
    'ai',
    'prompt',
    'system',
    'headings',
    'usageScenarios',
  ])}
${scenarioList}

## ${getPromptMessage(locale, [
    'ai',
    'prompt',
    'system',
    'headings',
    'outputRules',
  ])}
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
  const validScenarioIds = new Set(taxonomy.scenarios.map(s => s.id))

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
      scenarioIds: r.scenarioIds?.filter(id => validScenarioIds.has(id)),
    }))
}
