import { describe, expect, it } from 'vitest'
import {
  buildRequirementImportAiRequestTemplate,
  DEFAULT_REQUIREMENT_CANDIDATE_COUNT,
  getPromptMessage,
  getPromptMessageList,
  type RequirementImportDestinationKind,
} from '@/lib/ai/requirement-prompt'
import type { AppLocale } from '@/lib/locale-preference'
import {
  DEFAULT_REQUIREMENT_IMPORT_BUDGET,
  type RequirementImportBudget,
} from '@/lib/requirements/import-budget'
import { REQUIREMENTS_IMPORT_SCHEMA_VERSION } from '@/lib/requirements/import-schema'

const LOCALES = ['en', 'sv'] as const
const DESTINATION_KINDS = [
  'requirements_library',
  'requirements_specification',
] as const satisfies readonly RequirementImportDestinationKind[]
const CASES = LOCALES.flatMap(locale =>
  DESTINATION_KINDS.map(destinationKind => [locale, destinationKind] as const),
)

const BUDGET: RequirementImportBudget = {
  ...DEFAULT_REQUIREMENT_IMPORT_BUDGET,
  maxRows: 37,
}

// External AI products that the portable template must stay neutral about.
const PRODUCT_NAMES = [
  'ChatGPT',
  'Claude',
  'Copilot',
  'Gemini',
  'Microsoft',
  'OpenAI',
  'VS Code',
]

function templateMessage(locale: AppLocale, key: string) {
  return getPromptMessage(locale, ['ai', 'prompt', 'template', key])
}

function templateList(locale: AppLocale, key: string) {
  return getPromptMessageList(locale, ['ai', 'prompt', 'template', key])
}

function lines(template: string): string[] {
  return template.replace(/\n$/u, '').split('\n')
}

function build(
  locale: AppLocale,
  destinationKind: RequirementImportDestinationKind,
) {
  return buildRequirementImportAiRequestTemplate({
    budget: BUDGET,
    destinationKind,
    locale,
  })
}

describe('buildRequirementImportAiRequestTemplate', () => {
  it.each(CASES)(
    'starts and ends with the %s markers for %s',
    (locale, destinationKind) => {
      const templateLines = lines(build(locale, destinationKind))

      expect(templateLines[0]).toBe(templateMessage(locale, 'startMarker'))
      expect(templateLines.at(-1)).toBe(templateMessage(locale, 'endMarker'))
      expect(
        templateLines.filter(
          line =>
            line === templateMessage(locale, 'startMarker') ||
            line === templateMessage(locale, 'endMarker'),
        ),
      ).toHaveLength(2)
    },
  )

  it('uses the translated markers from the Spec', () => {
    expect(templateMessage('sv', 'startMarker')).toBe(
      '===== BÖRJAN PÅ AI-ANROPSMALL FÖR KRAVIMPORT =====',
    )
    expect(templateMessage('sv', 'endMarker')).toBe(
      '===== SLUT PÅ AI-ANROPSMALL =====',
    )
    expect(templateMessage('en', 'startMarker')).toBe(
      '===== START OF AI REQUEST TEMPLATE FOR REQUIREMENTS IMPORT =====',
    )
    expect(templateMessage('en', 'endMarker')).toBe(
      '===== END OF AI REQUEST TEMPLATE =====',
    )
  })

  it.each(CASES)(
    'states the schema version and destination kind and lists every check for %s %s',
    (locale, destinationKind) => {
      const template = build(locale, destinationKind)
      const values: Record<string, string> = {
        destinationKind,
        destinationLabel: getPromptMessage(locale, [
          'ai',
          'prompt',
          'template',
          'destinationLabels',
          destinationKind,
        ]),
        schemaVersion: REQUIREMENTS_IMPORT_SCHEMA_VERSION,
      }
      const fill = (text: string) =>
        text.replace(/\{([A-Za-z]+)\}/gu, (_match, name: string) => {
          const value = values[name]
          if (value === undefined) throw new Error(`Unexpected {${name}}`)
          return value
        })
      const checks = templateList(locale, 'checks')

      expect(checks).toHaveLength(4)
      expect(template).toContain(templateMessage(locale, 'checksIntro'))
      for (const check of checks) {
        expect(template).toContain(`- ${fill(check)}`)
      }
      expect(template).toContain(
        `- ${fill(templateList(locale, 'input').at(-1) ?? '')}`,
      )
      expect(template).toContain(`\`${REQUIREMENTS_IMPORT_SCHEMA_VERSION}\``)
      expect(template).toContain(`\`${destinationKind}\``)
    },
  )

  it.each(CASES)(
    'caps the requested count at maxRows from the budget and defaults to the internal count for %s %s',
    (locale, destinationKind) => {
      const template = build(locale, destinationKind)
      const [countRule, defaultRule] = templateList(locale, 'count')

      expect(template).toContain(
        `- ${countRule?.replace('{maxRows}', String(BUDGET.maxRows))}`,
      )
      expect(template).toContain(
        `- ${defaultRule?.replace(
          '{defaultCount}',
          String(DEFAULT_REQUIREMENT_CANDIDATE_COUNT),
        )}`,
      )
      expect(DEFAULT_REQUIREMENT_CANDIDATE_COUNT).toBe(8)
    },
  )

  it.each(CASES)(
    'describes the schema as the output contract and embeds it in one json code block for %s %s',
    (locale, destinationKind) => {
      const template = build(locale, destinationKind)
      const schemaBlocks = [...template.matchAll(/```json\n([^\n]*)\n```/gu)]

      expect(schemaBlocks).toHaveLength(1)
      expect(template.match(/```/gu)).toHaveLength(2)
      expect(JSON.parse(schemaBlocks[0]?.[1] ?? '')).toMatchObject({
        type: 'object',
      })
      const contractIndex = template.indexOf(
        templateMessage(locale, 'schemaContract'),
      )
      expect(contractIndex).toBeGreaterThan(-1)
      expect(contractIndex).toBeLessThan(schemaBlocks[0]?.index ?? -1)
    },
  )

  it.each(CASES)(
    'orders the template sections as the Spec requires for %s %s',
    (locale, destinationKind) => {
      const template = build(locale, destinationKind)
      const headingKeys = [
        'inputHeading',
        'checksHeading',
        'countHeading',
        'aiInstructionHeading',
        'importInstructionHeading',
        'schemaHeading',
      ]
      const positions = headingKeys.map(key =>
        template.indexOf(`\n# ${templateMessage(locale, key)}\n`),
      )

      expect(positions.every(position => position > 0)).toBe(true)
      expect([...positions].sort((left, right) => left - right)).toEqual(
        positions,
      )
    },
  )

  it.each(CASES)(
    'contains no placeholders, reference data, or AI product names inside the markers for %s %s',
    (locale, destinationKind) => {
      const template = build(locale, destinationKind)
      const referenceDataHeading = getPromptMessage(locale, [
        'ai',
        'prompt',
        'importInstruction',
        'referenceDataHeading',
      ])

      expect(template).not.toMatch(/\{[A-Za-z][A-Za-z0-9]*\}/u)
      expect(template).not.toContain(`## ${referenceDataHeading}`)
      expect(template).not.toMatch(/"(categories|normReferences|types)":\[/u)
      for (const productName of PRODUCT_NAMES) {
        expect(template).not.toContain(productName)
      }
    },
  )

  it('is fully translated per locale', () => {
    const en = build('en', 'requirements_library')
    const sv = build('sv', 'requirements_library')

    expect(sv).toContain(templateMessage('sv', 'schemaContract'))
    expect(sv).not.toContain(templateMessage('en', 'schemaContract'))
    expect(en).toContain(templateMessage('en', 'schemaContract'))
    expect(en).not.toContain(templateMessage('sv', 'schemaContract'))
  })
})
