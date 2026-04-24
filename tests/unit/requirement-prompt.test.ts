import { describe, expect, it } from 'vitest'
import {
  buildSystemPrompt,
  buildUserPrompt,
  DEFAULT_INSTRUCTION,
  DEFAULT_INSTRUCTION_SV,
  type GeneratedRequirement,
  getDefaultInstruction,
  getPromptMessage,
  getPromptMessageList,
  getPromptValue,
  REQUIREMENT_FORMAT_SCHEMA,
  type TaxonomyData,
  validateGeneratedRequirements,
} from '@/lib/ai/requirement-prompt'

const testTaxonomy: TaxonomyData = {
  categories: [
    { id: 1, name: 'Business' },
    { id: 2, name: 'IT' },
    { id: 3, name: 'Supplier' },
  ],
  qualityCharacteristics: [
    { id: 1, name: 'Functional suitability' },
    {
      id: 2,
      name: 'Functional correctness',
      parentName: 'Functional suitability',
    },
    { id: 10, name: 'Performance efficiency' },
    { id: 11, name: 'Time behavior', parentName: 'Performance efficiency' },
  ],
  riskLevels: [
    { id: 1, name: 'Low' },
    { id: 2, name: 'Medium' },
    { id: 3, name: 'High' },
  ],
  scenarios: [
    { id: 1, name: 'Normal operation' },
    { id: 2, name: 'High load' },
  ],
  types: [
    { id: 1, name: 'Functional' },
    { id: 2, name: 'Non-functional' },
  ],
}

const PROMPT_LOCALES = ['en', 'sv'] as const

const REQUIRED_PROMPT_MESSAGE_PATHS = [
  ['ai', 'prompt', 'defaultInstruction'],
  ['ai', 'prompt', 'noUsageScenariosAvailable'],
  ['ai', 'prompt', 'userHeader'],
  ['ai', 'prompt', 'system', 'intro'],
  ['ai', 'prompt', 'system', 'taxonomyIntro'],
  ['ai', 'prompt', 'system', 'headings', 'types'],
  ['ai', 'prompt', 'system', 'headings', 'categories'],
  ['ai', 'prompt', 'system', 'headings', 'qualityCharacteristics'],
  ['ai', 'prompt', 'system', 'headings', 'riskLevels'],
  ['ai', 'prompt', 'system', 'headings', 'usageScenarios'],
  ['ai', 'prompt', 'system', 'headings', 'outputRules'],
] as const

const REQUIRED_PROMPT_MESSAGE_LIST_PATHS = [
  ['ai', 'prompt', 'system', 'outputRules'],
] as const

describe('buildSystemPrompt', () => {
  it('includes all taxonomy IDs', () => {
    const prompt = buildSystemPrompt(testTaxonomy)
    expect(prompt).toContain('ID 1: Functional')
    expect(prompt).toContain('ID 2: Non-functional')
    expect(prompt).toContain('ID 1: Business')
    expect(prompt).toContain('ID 3: High')
    expect(prompt).toContain('ID 2: High load')
    expect(prompt).toContain(
      'ID 2: Functional suitability > Functional correctness',
    )
  })

  it('includes ISO standard references', () => {
    const prompt = buildSystemPrompt(testTaxonomy)
    expect(prompt).toContain('ISO/IEC/IEEE 29148:2018')
    expect(prompt).toContain('ISO/IEC 25030:2019')
    expect(prompt).toContain('ISO/IEC 25010:2023')
  })

  it('includes output rules', () => {
    const prompt = buildSystemPrompt(testTaxonomy)
    expect(prompt).toContain('typeId is required')
    expect(prompt).toContain(
      'scenarioIds must be [] or only contain IDs from the usage scenarios list above',
    )
    expect(prompt).toContain('requiresTesting must be true')
  })

  it('generates Swedish system prompt when locale is sv', () => {
    const prompt = buildSystemPrompt(testTaxonomy, 'sv')
    expect(prompt).toContain('Du är en expert på kravhantering')
    expect(prompt).toContain('Kravtyper')
    expect(prompt).toContain('Risknivåer')
    expect(prompt).toContain('Användningsscenarier')
    expect(prompt).toContain('ID 1: Functional')
  })

  it('uses localized fallback text when no usage scenarios are available', () => {
    const taxonomyWithoutScenarios: TaxonomyData = {
      ...testTaxonomy,
      scenarios: [],
    }

    expect(buildSystemPrompt(taxonomyWithoutScenarios)).toContain(
      'No usage scenarios available',
    )
    expect(buildSystemPrompt(taxonomyWithoutScenarios)).not.toContain(
      '  - No usage scenarios available',
    )
    expect(buildSystemPrompt(taxonomyWithoutScenarios, 'sv')).toContain(
      'Inga användningsscenarier tillgängliga',
    )
    expect(buildSystemPrompt(taxonomyWithoutScenarios, 'sv')).not.toContain(
      '  - Inga användningsscenarier tillgängliga',
    )
  })
})

describe('prompt localization helpers', () => {
  it.each(
    PROMPT_LOCALES,
  )('has every required string prompt message for %s', locale => {
    for (const path of REQUIRED_PROMPT_MESSAGE_PATHS) {
      expect(
        getPromptMessage(locale, path),
        `${locale}:${path.join('.')}`,
      ).not.toBe('')
    }
  })

  it.each(
    PROMPT_LOCALES,
  )('has every required prompt message list for %s', locale => {
    for (const path of REQUIRED_PROMPT_MESSAGE_LIST_PATHS) {
      expect(
        getPromptMessageList(locale, path),
        `${locale}:${path.join('.')}`,
      ).not.toEqual([])
    }
  })

  it('throws missing localization errors only for absent paths', () => {
    expect(() => getPromptValue('en', ['ai', 'prompt', 'missing'])).toThrow(
      'Missing prompt localization for en:ai.prompt.missing',
    )
    expect(() =>
      getPromptValue('en', ['ai', 'prompt', 'defaultInstruction', 'nested']),
    ).toThrow(
      'Missing prompt localization for en:ai.prompt.defaultInstruction.nested',
    )
  })

  it('throws invalid type errors for existing paths with the wrong shape', () => {
    expect(() =>
      getPromptMessage('en', ['ai', 'prompt', 'system', 'outputRules']),
    ).toThrow(
      'Invalid prompt localization type for en:ai.prompt.system.outputRules: expected string but got array<string>',
    )
    expect(() =>
      getPromptMessageList('en', ['ai', 'prompt', 'defaultInstruction']),
    ).toThrow(
      'Invalid prompt localization type for en:ai.prompt.defaultInstruction: expected string[] but got string',
    )
  })
})

describe('buildUserPrompt', () => {
  it('uses default instruction when none provided', () => {
    const prompt = buildUserPrompt('User management system')
    expect(prompt).toContain(DEFAULT_INSTRUCTION)
    expect(prompt).toContain('User management system')
  })

  it('uses custom instruction when provided', () => {
    const custom = 'Generate 3 security requirements'
    const prompt = buildUserPrompt('Auth service', custom)
    expect(prompt).toContain(custom)
    expect(prompt).not.toContain(DEFAULT_INSTRUCTION)
    expect(prompt).toContain('Auth service')
  })

  it('uses Swedish instruction when locale is sv', () => {
    const prompt = buildUserPrompt('Hantering av användare', undefined, 'sv')
    expect(prompt).toContain(DEFAULT_INSTRUCTION_SV)
    expect(prompt).toContain('Ämne / Systemkontext')
    expect(prompt).not.toContain('Topic / System Context')
  })

  it('uses English header when locale is en', () => {
    const prompt = buildUserPrompt('User management')
    expect(prompt).toContain('Topic / System Context')
    expect(prompt).not.toContain('Ämne / Systemkontext')
  })
})

describe('getDefaultInstruction', () => {
  it('returns English instruction by default', () => {
    expect(getDefaultInstruction()).toBe(DEFAULT_INSTRUCTION)
  })

  it('returns Swedish instruction for sv locale', () => {
    expect(getDefaultInstruction('sv')).toBe(DEFAULT_INSTRUCTION_SV)
  })
})

describe('REQUIREMENT_FORMAT_SCHEMA', () => {
  it('has the expected top-level structure', () => {
    expect(REQUIREMENT_FORMAT_SCHEMA).toHaveProperty('properties.requirements')
    expect(REQUIREMENT_FORMAT_SCHEMA).toHaveProperty('required', [
      'requirements',
    ])
  })

  it('defines required fields in items', () => {
    const items = (
      REQUIREMENT_FORMAT_SCHEMA.properties as Record<
        string,
        Record<string, unknown>
      >
    ).requirements as Record<string, unknown>
    const itemSchema = items.items as Record<string, unknown>
    expect(itemSchema.required).toEqual(
      expect.arrayContaining([
        'description',
        'typeId',
        'requiresTesting',
        'rationale',
      ]),
    )
  })
})

describe('validateGeneratedRequirements', () => {
  const validRequirement: GeneratedRequirement = {
    categoryId: 1,
    description: 'The system shall authenticate users',
    qualityCharacteristicId: 2,
    rationale: 'Security',
    requiresTesting: true,
    riskLevelId: 3,
    scenarioIds: [1],
    typeId: 1,
  }

  it('keeps requirements with valid taxonomy IDs', () => {
    const result = validateGeneratedRequirements(
      [validRequirement],
      testTaxonomy,
    )
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual(validRequirement)
  })

  it('filters out requirements with invalid typeId', () => {
    const invalid = { ...validRequirement, typeId: 99 }
    const result = validateGeneratedRequirements([invalid], testTaxonomy)
    expect(result).toHaveLength(0)
  })

  it('clears invalid categoryId but keeps requirement', () => {
    const withBadCat = { ...validRequirement, categoryId: 99 }
    const result = validateGeneratedRequirements([withBadCat], testTaxonomy)
    expect(result).toHaveLength(1)
    expect(result[0].categoryId).toBeUndefined()
  })

  it('clears invalid qualityCharacteristicId but keeps requirement', () => {
    const withBadQc = { ...validRequirement, qualityCharacteristicId: 999 }
    const result = validateGeneratedRequirements([withBadQc], testTaxonomy)
    expect(result).toHaveLength(1)
    expect(result[0].qualityCharacteristicId).toBeUndefined()
  })

  it('filters invalid scenarioIds', () => {
    const withBadScenario = { ...validRequirement, scenarioIds: [1, 99, 2] }
    const result = validateGeneratedRequirements(
      [withBadScenario],
      testTaxonomy,
    )
    expect(result).toHaveLength(1)
    expect(result[0].scenarioIds).toEqual([1, 2])
  })

  it('clears invalid riskLevelId', () => {
    const withBadRisk = { ...validRequirement, riskLevelId: 5 }
    const result = validateGeneratedRequirements([withBadRisk], testTaxonomy)
    expect(result).toHaveLength(1)
    expect(result[0].riskLevelId).toBeUndefined()
  })
})
