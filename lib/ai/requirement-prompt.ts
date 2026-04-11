/**
 * System prompt builder for AI requirement generation.
 * Produces prompts grounded in ISO/IEC/IEEE 29148:2018, ISO/IEC 25030:2019,
 * and ISO/IEC 25010:2023 standards.
 */

import type { GenerationStats } from '@/lib/ai/openrouter-client'

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

// ---------------------------------------------------------------------------
// Default instruction constant
// ---------------------------------------------------------------------------

export const DEFAULT_INSTRUCTION_EN = `Generate 5-10 well-structured system requirements for the given topic.

Each requirement MUST:
- Have a clear, testable, unambiguous description (per ISO/IEC/IEEE 29148:2018 §5.2.5)
- Use "The system shall…" form for functional requirements
- Use "The system shall be able to…" or quality-attribute language for non-functional requirements
- Include acceptance criteria where applicable
- Reference appropriate quality characteristics from ISO/IEC 25010:2023
- Include a rationale explaining why the requirement exists

For non-functional requirements, apply the ISO/IEC 25010:2023 quality model:
- Map each to the most specific quality sub-characteristic
- Consider performance efficiency, security, usability, reliability, and maintainability

Assess risk level based on:
- Impact on system safety, security, or core functionality (High)
- Impact on user experience or non-critical features (Medium)
- Nice-to-have or cosmetic requirements (Low)`

export const DEFAULT_INSTRUCTION_SV = `Generera 5-10 välstrukturerade systemkrav för det givna ämnet.

Varje krav MÅSTE:
- Ha en tydlig, testbar och entydig beskrivning (enligt ISO/IEC/IEEE 29148:2018 §5.2.5)
- Använda formen "Systemet ska…" för funktionella krav
- Använda "Systemet ska kunna…" eller kvalitetsattributspråk för icke-funktionella krav
- Inkludera acceptanskriterier där det är tillämpligt
- Referera till lämpliga kvalitetsegenskaper från ISO/IEC 25010:2023
- Inkludera en motivering som förklarar varför kravet finns

För icke-funktionella krav, tillämpa kvalitetsmodellen ISO/IEC 25010:2023:
- Mappa till den mest specifika kvalitetsunderegenskapen
- Beakta prestandaeffektivitet, säkerhet, användbarhet, tillförlitlighet och underhållbarhet

Bedöm risknivå baserat på:
- Påverkan på systemsäkerhet, informationssäkerhet eller kärnfunktionalitet (Hög)
- Påverkan på användarupplevelse eller icke-kritiska funktioner (Medel)
- Önskvärt eller kosmetiska krav (Låg)`

/** @deprecated Use DEFAULT_INSTRUCTION_EN instead */
export const DEFAULT_INSTRUCTION = DEFAULT_INSTRUCTION_EN

export function getDefaultInstruction(locale: 'en' | 'sv' = 'en'): string {
  return locale === 'sv' ? DEFAULT_INSTRUCTION_SV : DEFAULT_INSTRUCTION_EN
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

  const qcList = taxonomy.qualityCharacteristics
    .map(
      qc =>
        `  - ID ${qc.id}: ${qc.parentName ? `${qc.parentName} > ` : ''}${qc.name}`,
    )
    .join('\n')

  if (locale === 'sv') {
    return `Du är en expert på kravhantering. Du genererar systemkrav enligt internationella standarder:
- ISO/IEC/IEEE 29148:2018 (Kravhantering)
- ISO/IEC 25030:2019 (Ramverk för kvalitetskrav)
- ISO/IEC 25010:2023 (Kvalitetsmodell)

Du MÅSTE använda följande taxonomi-ID:n i din output. Använd bara ID:n från listorna nedan.

## Kravtyper
${typeList}

## Kategorier
${catList}

## Kvalitetsegenskaper (ISO 25010:2023)
${qcList}

## Risknivåer
${riskList}

## Outputregler
- Generera giltig JSON som matchar det angivna schemat
- Använd exakta ID:n från taxonomin ovan
- typeId krävs för varje krav
- qualityCharacteristicId rekommenderas för icke-funktionella krav
- categoryId bör sättas när kategorin är tydlig
- riskLevelId bör alltid sättas
- requiresTesting måste vara true för funktionella krav och säkerhetskrav
- verificationMethod bör beskriva hur kravet verifieras när requiresTesting är true
- rationale måste förklara varför kravet är viktigt för systemet
- Skriv beskrivningar, acceptanskriterier, verifieringsmetoder och motiveringar på svenska`
  }

  return `You are an expert requirements engineer. You generate system requirements following international standards:
- ISO/IEC/IEEE 29148:2018 (Requirements engineering)
- ISO/IEC 25030:2019 (Quality requirements framework)
- ISO/IEC 25010:2023 (Quality model)

You MUST use the following taxonomy IDs in your output. Only use IDs from the lists below.

## Requirement Types
${typeList}

## Categories
${catList}

## Quality Characteristics (ISO 25010:2023)
${qcList}

## Risk Levels
${riskList}

## Output Rules
- Output valid JSON matching the provided schema
- Use exact IDs from the taxonomy above
- typeId is required for every requirement
- qualityCharacteristicId is recommended for non-functional requirements
- categoryId should be set when the category is clear
- riskLevelId should always be set
- requiresTesting must be true for functional requirements and security requirements
- verificationMethod should describe how to verify the requirement when requiresTesting is true
- rationale must explain why the requirement matters for the system`
}

export function buildUserPrompt(
  topic: string,
  customInstruction?: string,
  locale?: 'en' | 'sv',
): string {
  const instruction = customInstruction?.trim() || getDefaultInstruction(locale)
  const header =
    locale === 'sv' ? 'Ämne / Systemkontext' : 'Topic / System Context'
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
