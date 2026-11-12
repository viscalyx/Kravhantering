import { createTranslator } from 'next-intl'
import { describe, expect, it } from 'vitest'
import {
  buildRequirementImportAiInstruction,
  buildRequirementImportInstruction,
  buildRequirementImportInstructionRules,
  buildRequirementImportRepairPrompt,
  buildRequirementImportRepairRules,
  buildRequirementImportRepairUserPrompt,
  buildRequirementImportResponseFormatSchema,
  buildRequirementImportRoleIntro,
  buildRequirementImportRuleOrder,
  buildRequirementImportSystemPrompt,
  buildRequirementImportUserPrompt,
  clampRequirementCandidateCount,
  DEFAULT_REQUIREMENT_CANDIDATE_COUNT,
  getPromptMessage,
  getPromptMessageList,
  getPromptRuleList,
  getPromptValue,
  MAX_REQUIREMENT_CANDIDATE_COUNT,
  MIN_REQUIREMENT_CANDIDATE_COUNT,
  type PromptRuleItem,
  type RequirementImportDestinationKind,
} from '@/lib/ai/requirement-prompt'
import type { AppLocale } from '@/lib/locale-preference'
import {
  DEFAULT_REQUIREMENT_IMPORT_BUDGET,
  type RequirementImportBudget,
} from '@/lib/requirements/import-budget'
import {
  type FormattedRequirementImportJsonErrors,
  formatRequirementImportJsonErrors,
  REQUIREMENT_IMPORT_REPAIR_PROMPT_ERROR_LIMIT,
} from '@/lib/requirements/import-json-errors'
import { readRequirementImportJson } from '@/lib/requirements/import-json-input'
import {
  buildRequirementsImportJsonSchema,
  buildRequirementsImportPayloadSchema,
  REQUIREMENTS_IMPORT_SCHEMA_VERSION,
} from '@/lib/requirements/import-schema'
import enMessages from '@/messages/en.json'
import svMessages from '@/messages/sv.json'

const PROMPT_LOCALES = ['en', 'sv'] as const
const DESTINATION_KINDS = [
  'requirements_library',
  'requirements_specification',
] as const satisfies readonly RequirementImportDestinationKind[]
const LOCALE_DESTINATION_CASES = PROMPT_LOCALES.flatMap(locale =>
  DESTINATION_KINDS.map(destinationKind => [locale, destinationKind] as const),
)

const DISTINCT_BUDGET: RequirementImportBudget = {
  maxJsonDepth: 7,
  maxNestedItems: 11,
  maxProposedNeedsReferences: 13,
  maxProposedNormReferences: 17,
  maxRows: 19,
}

const IMPORT_INSTRUCTION_PATH = ['ai', 'prompt', 'importInstruction'] as const

function importInstructionMessage(locale: AppLocale, key: string): string {
  return getPromptMessage(locale, [...IMPORT_INSTRUCTION_PATH, key])
}

function importInstructionRuleList(
  locale: AppLocale,
  key: string,
): PromptRuleItem[] {
  return getPromptRuleList(locale, [...IMPORT_INSTRUCTION_PATH, key])
}

function fillBudgetPlaceholders(
  text: string,
  budget: RequirementImportBudget,
): string {
  return text
    .replaceAll('{schemaVersion}', REQUIREMENTS_IMPORT_SCHEMA_VERSION)
    .replaceAll('{maxRows}', String(budget.maxRows))
    .replaceAll(
      '{maxProposedNormReferences}',
      String(budget.maxProposedNormReferences),
    )
    .replaceAll(
      '{maxProposedNeedsReferences}',
      String(budget.maxProposedNeedsReferences),
    )
    .replaceAll('{maxNestedItems}', String(budget.maxNestedItems))
    .replaceAll('{maxJsonDepth}', String(budget.maxJsonDepth))
}

function expectedRuleLines(
  items: readonly PromptRuleItem[],
  budget: RequirementImportBudget,
): string[] {
  return items.flatMap(item =>
    typeof item === 'string'
      ? [`- ${fillBudgetPlaceholders(item, budget)}`]
      : item.map(subItem => `  - ${fillBudgetPlaceholders(subItem, budget)}`),
  )
}

function expectLinesInOrder(text: string, lines: readonly string[]): void {
  const textLines = text.split('\n')
  let previousIndex = -1
  for (const line of lines) {
    const index = textLines.indexOf(line, previousIndex + 1)
    expect(index, line).toBeGreaterThan(previousIndex)
    previousIndex = index
  }
}

const REQUIRED_PROMPT_MESSAGE_PATHS = [
  ['ai', 'prompt', 'defaultInstruction'],
  ['ai', 'prompt', 'userHeader'],
  ['ai', 'prompt', 'countLabel'],
  ['ai', 'prompt', 'instructionHeader'],
  ['ai', 'prompt', 'system', 'intro'],
  ['ai', 'prompt', 'system', 'importContractHeading'],
  ['ai', 'prompt', 'ruleOrder', 'intro'],
  ['ai', 'prompt', 'importInstruction', 'title'],
  ['ai', 'prompt', 'importInstruction', 'rulesHeading'],
  ['ai', 'prompt', 'importInstruction', 'conflictsHeading'],
  ['ai', 'prompt', 'importInstruction', 'fieldSelectionHeading'],
  ['ai', 'prompt', 'importInstruction', 'referenceDataHeading'],
  ['ai', 'prompt', 'repair', 'intro'],
  ['ai', 'prompt', 'repair', 'errorHeading'],
  ['ai', 'prompt', 'repair', 'jsonHeading'],
  ['ai', 'prompt', 'repair', 'defaultValidationError'],
] as const

const REQUIRED_PROMPT_MESSAGE_LIST_PATHS = [
  ['ai', 'prompt', 'repair', 'rules'],
  ['ai', 'prompt', 'ruleOrder', 'items'],
] as const

const REQUIRED_PROMPT_RULE_LIST_PATHS = [
  ['ai', 'prompt', 'importInstruction', 'rules'],
  ['ai', 'prompt', 'importInstruction', 'conflicts'],
  ['ai', 'prompt', 'importInstruction', 'fieldSelection'],
  ['ai', 'prompt', 'importInstruction', 'libraryNeedsReferences'],
  ['ai', 'prompt', 'importInstruction', 'specificationNeedsReferences'],
  ['ai', 'prompt', 'importInstruction', 'fieldSelectionAfterNeedsReferences'],
] as const

describe('prompt localization helpers', () => {
  it.each(PROMPT_LOCALES)(
    'has every required string prompt message for %s',
    locale => {
      for (const path of REQUIRED_PROMPT_MESSAGE_PATHS) {
        expect(
          getPromptMessage(locale, path),
          `${locale}:${path.join('.')}`,
        ).not.toBe('')
      }
    },
  )

  it.each(PROMPT_LOCALES)(
    'has every required prompt message list for %s',
    locale => {
      for (const path of REQUIRED_PROMPT_MESSAGE_LIST_PATHS) {
        expect(
          getPromptMessageList(locale, path),
          `${locale}:${path.join('.')}`,
        ).not.toEqual([])
      }
    },
  )

  it.each(PROMPT_LOCALES)(
    'has every required prompt rule list for %s',
    locale => {
      for (const path of REQUIRED_PROMPT_RULE_LIST_PATHS) {
        expect(
          getPromptRuleList(locale, path),
          `${locale}:${path.join('.')}`,
        ).not.toEqual([])
      }
    },
  )

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
    expect(() =>
      getPromptRuleList('en', ['ai', 'prompt', 'system', 'intro']),
    ).toThrow(
      'Invalid prompt localization type for en:ai.prompt.system.intro: expected Array<string | string[]> but got string',
    )
  })
})

describe('buildRequirementImportAiInstruction', () => {
  it.each(PROMPT_LOCALES)(
    'returns the app-owned AI instruction for %s',
    locale => {
      expect(buildRequirementImportAiInstruction(locale)).toBe(
        getPromptMessage(locale, ['ai', 'prompt', 'defaultInstruction']),
      )
    },
  )

  it('uses English by default', () => {
    expect(buildRequirementImportAiInstruction()).toBe(
      buildRequirementImportAiInstruction('en'),
    )
  })
})

describe('buildRequirementImportRoleIntro', () => {
  it.each(PROMPT_LOCALES)(
    'returns the channel-neutral role intro for %s',
    locale => {
      expect(buildRequirementImportRoleIntro(locale)).toBe(
        getPromptMessage(locale, ['ai', 'prompt', 'system', 'intro']),
      )
    },
  )
})

describe('buildRequirementImportRuleOrder', () => {
  it.each(PROMPT_LOCALES)(
    'lists the four rule-order items as a numbered list after the intro for %s',
    locale => {
      const items = getPromptMessageList(locale, [
        'ai',
        'prompt',
        'ruleOrder',
        'items',
      ])

      expect(items).toHaveLength(4)
      expect(buildRequirementImportRuleOrder(locale)).toBe(
        [
          getPromptMessage(locale, ['ai', 'prompt', 'ruleOrder', 'intro']),
          ...items.map((item, index) => `${index + 1}. ${item}`),
        ].join('\n'),
      )
    },
  )
})

describe('buildRequirementImportInstructionRules', () => {
  it.each(LOCALE_DESTINATION_CASES)(
    'renders every rule section in order for %s %s',
    (locale, destinationKind) => {
      const rules = buildRequirementImportInstructionRules({
        budget: DISTINCT_BUDGET,
        destinationKind,
        locale,
      })
      const destinationRulesKey =
        destinationKind === 'requirements_specification'
          ? 'specificationNeedsReferences'
          : 'libraryNeedsReferences'

      expectLinesInOrder(rules, [
        `## ${importInstructionMessage(locale, 'rulesHeading')}`,
        ...expectedRuleLines(
          importInstructionRuleList(locale, 'rules'),
          DISTINCT_BUDGET,
        ),
        `## ${importInstructionMessage(locale, 'conflictsHeading')}`,
        ...expectedRuleLines(
          importInstructionRuleList(locale, 'conflicts'),
          DISTINCT_BUDGET,
        ),
        `## ${importInstructionMessage(locale, 'fieldSelectionHeading')}`,
        ...expectedRuleLines(
          importInstructionRuleList(locale, 'fieldSelection'),
          DISTINCT_BUDGET,
        ),
        ...expectedRuleLines(
          importInstructionRuleList(locale, destinationRulesKey),
          DISTINCT_BUDGET,
        ),
        ...expectedRuleLines(
          importInstructionRuleList(
            locale,
            'fieldSelectionAfterNeedsReferences',
          ),
          DISTINCT_BUDGET,
        ),
      ])
    },
  )

  it.each(PROMPT_LOCALES)(
    'fills the schemaVersion and budget placeholders for %s',
    locale => {
      const rules = buildRequirementImportInstructionRules({
        budget: DISTINCT_BUDGET,
        destinationKind: 'requirements_library',
        locale,
      })

      expect(rules).not.toMatch(/\{[A-Za-z][A-Za-z0-9]*\}/u)
      expect(rules).toContain(`\`${REQUIREMENTS_IMPORT_SCHEMA_VERSION}\``)
      for (const limit of Object.values(DISTINCT_BUDGET)) {
        expect(rules).toContain(String(limit))
      }
    },
  )

  it.each(PROMPT_LOCALES)(
    'starts the rules section with rule 1 for %s',
    locale => {
      const [firstRule] = importInstructionRuleList(locale, 'rules')
      const rules = buildRequirementImportInstructionRules({
        budget: DISTINCT_BUDGET,
        destinationKind: 'requirements_library',
        locale,
      })

      expect(typeof firstRule).toBe('string')
      expect(rules.split('\n').slice(0, 3)).toEqual([
        `## ${importInstructionMessage(locale, 'rulesHeading')}`,
        '',
        `- ${firstRule}`,
      ])
    },
  )

  it.each(LOCALE_DESTINATION_CASES)(
    'keeps destination-specific needs-reference rules scoped to their destination for %s %s',
    (locale, destinationKind) => {
      const lines = buildRequirementImportInstructionRules({
        budget: DISTINCT_BUDGET,
        destinationKind,
        locale,
      }).split('\n')
      const otherDestinationKey =
        destinationKind === 'requirements_specification'
          ? 'libraryNeedsReferences'
          : 'specificationNeedsReferences'

      for (const line of expectedRuleLines(
        importInstructionRuleList(locale, otherDestinationKey),
        DISTINCT_BUDGET,
      )) {
        expect(lines).not.toContain(line)
      }
    },
  )

  it.each(PROMPT_LOCALES)(
    'leaves the reference data out of the rules part for %s',
    locale => {
      const rules = buildRequirementImportInstructionRules({
        budget: DISTINCT_BUDGET,
        destinationKind: 'requirements_specification',
        locale,
      })

      expect(rules).not.toContain(
        `## ${importInstructionMessage(locale, 'referenceDataHeading')}`,
      )
      expect(rules).not.toContain('```')
    },
  )
})

describe('buildRequirementImportInstruction', () => {
  it.each(LOCALE_DESTINATION_CASES)(
    'combines the title, rules part, and indented reference data for %s %s',
    (locale, destinationKind) => {
      const referenceData = {
        categories: [{ id: 1, name: 'Category' }],
        types: [],
      }

      expect(
        buildRequirementImportInstruction({
          budget: DISTINCT_BUDGET,
          destinationKind,
          locale,
          referenceData,
        }),
      ).toBe(
        [
          `# ${importInstructionMessage(locale, 'title')}`,
          '',
          buildRequirementImportInstructionRules({
            budget: DISTINCT_BUDGET,
            destinationKind,
            locale,
          }),
          '',
          `## ${importInstructionMessage(locale, 'referenceDataHeading')}`,
          '',
          '```json',
          JSON.stringify(referenceData, null, 2),
          '```',
        ].join('\n'),
      )
    },
  )
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
    expect(schema).not.toHaveProperty('x-requirement-import-budget')
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

  it('uses the effective import budget in structured output constraints', () => {
    const schema = buildRequirementImportResponseFormatSchema('en', {
      maxJsonDepth: 6,
      maxNestedItems: 10,
      maxProposedNeedsReferences: 20,
      maxProposedNormReferences: 30,
      maxRows: 40,
    })

    expect(schema).toHaveProperty('properties.requirements.maxItems', 40)
    expect(schema).toHaveProperty(
      'properties.proposedNormReferences.maxItems',
      30,
    )
    expect(schema).toHaveProperty(
      'properties.proposedNeedsReferences.maxItems',
      20,
    )
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
  it.each(PROMPT_LOCALES)(
    'composes the role intro, rule order, and import instruction for %s',
    locale => {
      const importInstruction = buildRequirementImportInstruction({
        budget: DISTINCT_BUDGET,
        destinationKind: 'requirements_library',
        locale,
        referenceData: { categories: [] },
      })

      expect(
        buildRequirementImportSystemPrompt(importInstruction, locale),
      ).toBe(
        [
          buildRequirementImportRoleIntro(locale),
          buildRequirementImportRuleOrder(locale),
          getPromptMessage(locale, [
            'ai',
            'prompt',
            'system',
            'importContractHeading',
          ]),
          importInstruction,
        ].join('\n\n'),
      )
    },
  )

  it('keeps the AI instruction in the user message, not the system message', () => {
    const prompt = buildRequirementImportSystemPrompt('# Import', 'en')

    expect(prompt).not.toContain(buildRequirementImportAiInstruction('en'))
  })
})

describe('buildRequirementImportUserPrompt', () => {
  it('uses default AI instruction, need, and requested candidate count', () => {
    const prompt = buildRequirementImportUserPrompt({
      count: 12,
      need: 'Student grading system',
    })

    expect(prompt).toContain(buildRequirementImportAiInstruction('en'))
    expect(prompt).toContain('Need and context')
    expect(prompt).toContain('Student grading system')
    expect(prompt).toContain('Number of requirement candidates\n12')
  })

  it('uses Swedish labels and instruction when locale is sv', () => {
    const prompt = buildRequirementImportUserPrompt({
      locale: 'sv',
      need: 'Elevbetyg',
    })

    expect(prompt).toContain(buildRequirementImportAiInstruction('sv'))
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

describe('buildRequirementImportRepairUserPrompt', () => {
  it('builds a narrow repair prompt with errors and broken JSON', () => {
    const prompt = buildRequirementImportRepairUserPrompt({
      brokenJson: '{"requirements":[]}',
      errors: ['requirements: must contain at least 1 item'],
    })

    expect(prompt).toContain('Repair the JSON')
    expect(prompt).toContain('Preserve the requirement content')
    expect(prompt).toContain(
      'Treat every validation path as the exact field location',
    )
    expect(prompt).toContain(
      'Correct every listed validation error in the same response',
    )
    expect(prompt).toContain(
      'Do not add new proposed needs references or new needs-reference links',
    )
    expect(prompt).toContain('requirements: must contain at least 1 item')
    expect(prompt).toContain('"invalidJsonPayload": "{\\"requirements\\":[]}"')
    expect(prompt).not.toContain('```json')
  })

  it.each(PROMPT_LOCALES)(
    'uses the shared repair rules part for %s',
    locale => {
      const prompt = buildRequirementImportRepairUserPrompt({
        brokenJson: '{}',
        errors: [],
        locale,
      })

      expect(buildRequirementImportRepairRules(locale)).toBe(
        getPromptMessageList(locale, ['ai', 'prompt', 'repair', 'rules'])
          .map(rule => `- ${rule}`)
          .join('\n'),
      )
      expect(prompt).toContain(buildRequirementImportRepairRules(locale))
    },
  )

  it('strips outer markdown fences and uses the fallback repair error', () => {
    const prompt = buildRequirementImportRepairUserPrompt({
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

function repairPromptErrors(
  locale: AppLocale,
  requirementCount: number,
  limit = REQUIREMENT_IMPORT_REPAIR_PROMPT_ERROR_LIMIT,
): FormattedRequirementImportJsonErrors {
  return repairPromptErrorsFor(
    locale,
    JSON.stringify({
      requirements: Array.from({ length: requirementCount }, () => ({})),
      schemaVersion: REQUIREMENTS_IMPORT_SCHEMA_VERSION,
    }),
    limit,
  )
}

function repairPromptErrorsFor(
  locale: AppLocale,
  importText: string,
  limit = REQUIREMENT_IMPORT_REPAIR_PROMPT_ERROR_LIMIT,
): FormattedRequirementImportJsonErrors {
  const { problem } = readRequirementImportJson(
    importText,
    buildRequirementsImportPayloadSchema(DEFAULT_REQUIREMENT_IMPORT_BUDGET),
  )
  if (!problem) throw new Error('Expected an import JSON problem')
  const translate = createTranslator({
    locale,
    messages: locale === 'sv' ? svMessages : enMessages,
    namespace: 'requirementsImportJson',
  })
  return formatRequirementImportJsonErrors(problem, {
    limit,
    t: (key, values) => translate(key as never, values as never),
  })
}

function repairPromptParagraphs(prompt: string): string[] {
  return prompt.split('\n\n')
}

// External AI products that the repair prompt must stay neutral about.
const PRODUCT_NAMES = [
  'ChatGPT',
  'Claude',
  'Copilot',
  'Gemini',
  'Microsoft',
  'OpenAI',
  'VS Code',
]

describe('buildRequirementImportRepairPrompt', () => {
  it.each(PROMPT_LOCALES)(
    'uses the same repair rule list as the internal repair request for %s',
    locale => {
      const externalRules = repairPromptParagraphs(
        buildRequirementImportRepairPrompt({
          errors: repairPromptErrors(locale, 1),
          locale,
        }),
      )[1]
      const internalRules = repairPromptParagraphs(
        buildRequirementImportRepairUserPrompt({
          brokenJson: '{}',
          errors: ['requirements: must contain at least 1 item'],
          locale,
        }),
      )[1]

      expect(externalRules).toBe(buildRequirementImportRepairRules(locale))
      expect(internalRules).toBe(buildRequirementImportRepairRules(locale))
    },
  )

  it.each(PROMPT_LOCALES)(
    'starts with the follow-up intro and lists each formatted error with its JSON path for %s',
    locale => {
      const errors = repairPromptErrors(locale, 2)
      const paragraphs = repairPromptParagraphs(
        buildRequirementImportRepairPrompt({ errors, locale }),
      )

      expect(paragraphs[0]).toBe(
        getPromptMessage(locale, ['ai', 'prompt', 'repair', 'externalIntro']),
      )
      expect(paragraphs[2]).toBe(
        [
          getPromptMessage(locale, ['ai', 'prompt', 'repair', 'errorHeading']),
          ...errors.errors.map(error => `- ${error.path}: ${error.message}`),
        ].join('\n'),
      )
      expect(paragraphs).toHaveLength(3)
    },
  )

  it.each(PROMPT_LOCALES)(
    'lists at most 50 errors followed by the remaining count for %s',
    locale => {
      const errors = repairPromptErrors(locale, 57)
      const prompt = buildRequirementImportRepairPrompt({ errors, locale })
      const errorLines = prompt
        .split('\n')
        .filter(line => line.startsWith('- $.'))

      expect(errors.omittedCount).toBe(7)
      expect(errorLines).toHaveLength(
        REQUIREMENT_IMPORT_REPAIR_PROMPT_ERROR_LIMIT,
      )
      expect(repairPromptParagraphs(prompt).at(-1)).toBe(
        getPromptMessage(locale, [
          'ai',
          'prompt',
          'repair',
          'moreErrors',
        ]).replace('{count}', '7'),
      )
    },
  )

  it.each(PROMPT_LOCALES)(
    'uses the singular remaining-count line for one omitted error for %s',
    locale => {
      const prompt = buildRequirementImportRepairPrompt({
        errors: repairPromptErrors(locale, 51),
        locale,
      })

      expect(repairPromptParagraphs(prompt).at(-1)).toBe(
        getPromptMessage(locale, ['ai', 'prompt', 'repair', 'moreErrorsOne']),
      )
    },
  )

  it('caps an uncapped error list at 50 and counts the rest as remaining', () => {
    const errors = repairPromptErrors('en', 57, 100)
    const prompt = buildRequirementImportRepairPrompt({ errors, locale: 'en' })

    expect(errors.errors).toHaveLength(57)
    expect(
      prompt.split('\n').filter(line => line.startsWith('- $.')),
    ).toHaveLength(REQUIREMENT_IMPORT_REPAIR_PROMPT_ERROR_LIMIT)
    expect(repairPromptParagraphs(prompt).at(-1)).toBe(
      getPromptMessage('en', ['ai', 'prompt', 'repair', 'moreErrors']).replace(
        '{count}',
        '7',
      ),
    )
  })

  it.each(PROMPT_LOCALES)(
    'contains no JSON, no schema, no code fences, and no AI product names for %s',
    locale => {
      const prompt = buildRequirementImportRepairPrompt({
        errors: repairPromptErrors(locale, 57),
        locale,
      })

      expect(prompt).not.toMatch(/[{}]/u)
      expect(prompt).not.toContain('```')
      expect(prompt).not.toContain('$schema')
      expect(prompt).not.toContain(
        JSON.stringify(buildRequirementsImportJsonSchema(locale)),
      )
      for (const productName of PRODUCT_NAMES) {
        expect(prompt).not.toContain(productName)
      }
    },
  )

  // The AI assistant already has its own response in the conversation, so
  // the prompt never echoes the pasted JSON back.
  const PASTED_CONTENT = 'Pasted requirement text 4711'
  it.each([
    [
      'a syntax error',
      `{\n  "requirements": [{ "description": "${PASTED_CONTENT}" }],,\n}`,
    ],
    [
      'a wrong schemaVersion',
      JSON.stringify({
        requirements: [{ description: PASTED_CONTENT }],
        schemaVersion: 'requirement-import.v1',
      }),
    ],
    [
      'schema errors',
      JSON.stringify({
        requirements: [{ description: PASTED_CONTENT, typeId: 'one' }],
        schemaVersion: REQUIREMENTS_IMPORT_SCHEMA_VERSION,
      }),
    ],
  ])('leaves out the pasted JSON for %s', (_label, importText) => {
    for (const locale of PROMPT_LOCALES) {
      const errors = repairPromptErrorsFor(locale, importText)
      const prompt = buildRequirementImportRepairPrompt({ errors, locale })

      expect(errors.errors.length).toBeGreaterThan(0)
      expect(prompt).not.toContain(PASTED_CONTENT)
      expect(prompt).not.toContain('"requirements"')
      expect(prompt).not.toContain('```')
    }
  })
})
