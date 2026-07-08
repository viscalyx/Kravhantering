import { describe, expect, it } from 'vitest'
import {
  buildRequirementImportRepairPrompt,
  buildRequirementImportResponseFormatSchema,
  buildRequirementImportSystemPrompt,
  buildRequirementImportUserPrompt,
  clampRequirementCandidateCount,
  DEFAULT_INSTRUCTION_EN,
  DEFAULT_INSTRUCTION_SV,
  DEFAULT_REQUIREMENT_CANDIDATE_COUNT,
  getDefaultInstruction,
  getPromptMessage,
  getPromptMessageList,
  getPromptValue,
  MAX_REQUIREMENT_CANDIDATE_COUNT,
  MIN_REQUIREMENT_CANDIDATE_COUNT,
} from '@/lib/ai/requirement-prompt'
import {
  buildRequirementsImportJsonSchema,
  REQUIREMENTS_IMPORT_SCHEMA_VERSION,
} from '@/lib/requirements/import-schema'

const PROMPT_LOCALES = ['en', 'sv'] as const

const REQUIRED_PROMPT_MESSAGE_PATHS = [
  ['ai', 'prompt', 'defaultInstruction'],
  ['ai', 'prompt', 'userHeader'],
  ['ai', 'prompt', 'countLabel'],
  ['ai', 'prompt', 'instructionHeader'],
  ['ai', 'prompt', 'system', 'intro'],
  ['ai', 'prompt', 'system', 'importContractHeading'],
  ['ai', 'prompt', 'repair', 'intro'],
  ['ai', 'prompt', 'repair', 'errorHeading'],
  ['ai', 'prompt', 'repair', 'jsonHeading'],
  ['ai', 'prompt', 'repair', 'defaultValidationError'],
] as const

const REQUIRED_PROMPT_MESSAGE_LIST_PATHS = [
  ['ai', 'prompt', 'repair', 'rules'],
] as const

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
      getPromptMessage('en', ['ai', 'prompt', 'repair', 'rules']),
    ).toThrow(
      'Invalid prompt localization type for en:ai.prompt.repair.rules: expected string but got array<string>',
    )
    expect(() =>
      getPromptMessageList('en', ['ai', 'prompt', 'defaultInstruction']),
    ).toThrow(
      'Invalid prompt localization type for en:ai.prompt.defaultInstruction: expected string[] but got string',
    )
  })
})

describe('getDefaultInstruction', () => {
  it('returns English instruction by default', () => {
    expect(getDefaultInstruction()).toBe(DEFAULT_INSTRUCTION_EN)
  })

  it('returns Swedish instruction for sv locale', () => {
    expect(getDefaultInstruction('sv')).toBe(DEFAULT_INSTRUCTION_SV)
  })

  it('mentions needs references among import-instruction governed fields', () => {
    expect(DEFAULT_INSTRUCTION_EN).toContain(
      'norm references, and needs references only through the fields supported by the import instruction',
    )
    expect(DEFAULT_INSTRUCTION_SV).toContain(
      'normreferenser och behovsreferenser endast genom fält som stöds av importinstruktionen',
    )
  })
})

describe('buildRequirementImportResponseFormatSchema', () => {
  it('derives a structured-output strict schema from the import schema', () => {
    const importSchema = buildRequirementsImportJsonSchema('sv')
    const schema = buildRequirementImportResponseFormatSchema('sv')

    expect(importSchema).toHaveProperty('required', [
      'schemaVersion',
      'requirements',
    ])
    expect(schema).not.toHaveProperty('$schema')
    expect(schema).toMatchObject({
      additionalProperties: false,
      required: [
        'proposedNormReferences',
        'proposedNeedsReferences',
        'requirements',
        'schemaVersion',
      ],
      title: 'Kravimport',
      type: 'object',
    })
    expect(schema).toHaveProperty('properties.schemaVersion.enum', [
      REQUIREMENTS_IMPORT_SCHEMA_VERSION,
    ])

    const properties = schema.properties as Record<string, unknown>
    const proposedNormReferences = properties.proposedNormReferences as {
      items: { properties: Record<string, unknown>; required: string[] }
    }
    expect(proposedNormReferences.items.required).toEqual(
      Object.keys(proposedNormReferences.items.properties),
    )
    expect(proposedNormReferences.items.required).toContain('normReferenceId')
    expect(
      proposedNormReferences.items.properties.normReferenceId,
    ).toMatchObject({
      type: 'string',
    })
    expect(proposedNormReferences.items.properties.uri).toMatchObject({
      type: 'string',
    })
    expect(proposedNormReferences.items.properties.version).toMatchObject({
      type: 'string',
    })

    const proposedNeedsReferences = properties.proposedNeedsReferences as {
      items: { properties: Record<string, unknown>; required: string[] }
    }
    expect(proposedNeedsReferences.items.required).toEqual(
      Object.keys(proposedNeedsReferences.items.properties),
    )
    expect(proposedNeedsReferences.items.properties.description).toMatchObject({
      type: 'string',
    })

    const requirements = properties.requirements as {
      items: { properties: Record<string, unknown>; required: string[] }
    }
    expect(requirements.items.required).toEqual(
      Object.keys(requirements.items.properties),
    )
    expect(requirements.items.properties.categoryId).toMatchObject({
      type: ['integer', 'null'],
    })
    expect(requirements.items.properties.categoryId).not.toHaveProperty(
      'minimum',
    )
    expect(requirements.items.properties.categoryId).not.toHaveProperty(
      'maximum',
    )
    expect(requirements.items.properties.acceptanceCriteria).toMatchObject({
      type: 'string',
    })
    expect(requirements.items.properties.categoryName).toMatchObject({
      type: 'string',
    })
    expect(requirements.items.properties.verifiable).toMatchObject({
      type: ['boolean', 'null'],
    })
    expect(requirements.items.properties.needsReferenceId).toMatchObject({
      type: ['integer', 'null'],
    })
    expect(requirements.items.properties.needsReferenceId).not.toHaveProperty(
      'minimum',
    )
    expect(requirements.items.properties.needsReferenceId).not.toHaveProperty(
      'maximum',
    )
    expect(requirements.items.properties.needsReferenceKey).toMatchObject({
      type: 'string',
    })
    expect(
      requirements.items.properties.qualityCharacteristicName,
    ).toMatchObject({
      type: 'string',
    })
    expect(requirements.items.properties.priorityLevelCode).toMatchObject({
      type: 'string',
    })
    expect(requirements.items.properties.priorityLevelName).toMatchObject({
      type: 'string',
    })
    expect(requirements.items.properties.typeName).toMatchObject({
      type: 'string',
    })
    expect(requirements.items.properties.verificationMethod).toMatchObject({
      type: 'string',
    })
    expect(requirements.items.properties.requirementPackageIds).toHaveProperty(
      'items',
      { type: 'integer' },
    )
    expect(
      (
        requirements.items.properties.requirementPackageIds as {
          items: Record<string, unknown>
        }
      ).items,
    ).not.toHaveProperty('minimum')
    expect(
      (
        requirements.items.properties.requirementPackageIds as {
          items: Record<string, unknown>
        }
      ).items,
    ).not.toHaveProperty('maximum')
  })

  it('keeps the OpenRouter structured-output schema below provider union limits', () => {
    const schema = buildRequirementImportResponseFormatSchema('sv')
    let unionCount = 0

    function countUnions(value: unknown) {
      if (Array.isArray(value)) {
        for (const item of value) countUnions(item)
        return
      }
      if (typeof value !== 'object' || value === null) return

      const record = value as Record<string, unknown>
      if (Array.isArray(record.type) || Array.isArray(record.anyOf)) {
        unionCount += 1
      }
      for (const item of Object.values(record)) countUnions(item)
    }

    countUnions(schema)

    expect(unionCount).toBeLessThanOrEqual(16)
  })
})

describe('buildRequirementImportSystemPrompt', () => {
  it('contains only AI generation framing plus the import contract', () => {
    const prompt = buildRequirementImportSystemPrompt(
      '# Import instruction\n\nUse schemaVersion.',
    )

    expect(prompt).toContain('Generate requirement import JSON only')
    expect(prompt).toContain('cannot be overridden')
    expect(prompt).toContain('# Import instruction')
    expect(prompt).not.toContain('taxonomy IDs')
  })
})

describe('buildRequirementImportUserPrompt', () => {
  it('uses default AI instruction, need, and requested candidate count', () => {
    const prompt = buildRequirementImportUserPrompt({
      count: 12,
      need: 'Student grading system',
    })

    expect(prompt).toContain(DEFAULT_INSTRUCTION_EN)
    expect(prompt).toContain('Need and context')
    expect(prompt).toContain('Student grading system')
    expect(prompt).toContain('Number of requirement candidates\n12')
  })

  it('uses Swedish labels and instruction when locale is sv', () => {
    const prompt = buildRequirementImportUserPrompt({
      locale: 'sv',
      need: 'Elevbetyg',
    })

    expect(prompt).toContain(DEFAULT_INSTRUCTION_SV)
    expect(prompt).toContain('Behov och sammanhang')
    expect(prompt).toContain('Elevbetyg')
  })
})

describe('clampRequirementCandidateCount', () => {
  it('keeps candidate count within supported bounds', () => {
    expect(clampRequirementCandidateCount(-1)).toBe(
      MIN_REQUIREMENT_CANDIDATE_COUNT,
    )
    expect(clampRequirementCandidateCount(5.8)).toBe(5)
    expect(clampRequirementCandidateCount(999)).toBe(
      MAX_REQUIREMENT_CANDIDATE_COUNT,
    )
    expect(clampRequirementCandidateCount(Number.NaN)).toBe(
      DEFAULT_REQUIREMENT_CANDIDATE_COUNT,
    )
  })
})

describe('buildRequirementImportRepairPrompt', () => {
  it('builds a narrow repair prompt with errors and broken JSON', () => {
    const prompt = buildRequirementImportRepairPrompt({
      brokenJson: '{"requirements":[]}',
      errors: ['requirements: must contain at least 1 item'],
    })

    expect(prompt).toContain('Repair the JSON')
    expect(prompt).toContain('Preserve the requirement content')
    expect(prompt).toContain(
      'Do not add new proposed needs references or new needs-reference links',
    )
    expect(prompt).toContain('requirements: must contain at least 1 item')
    expect(prompt).toContain('"invalidJsonPayload": "{\\"requirements\\":[]}"')
    expect(prompt).not.toContain('```json')
  })

  it('strips outer markdown fences and uses the fallback repair error', () => {
    const prompt = buildRequirementImportRepairPrompt({
      brokenJson: '```json\n{"requirements":[]}\n```',
      errors: [],
    })

    expect(prompt).toContain(
      '- JSON did not validate against the import contract.',
    )
    expect(prompt).toContain('"invalidJsonPayload": "{\\"requirements\\":[]}"')
    expect(prompt).not.toMatch(/^```/m)
  })
})
