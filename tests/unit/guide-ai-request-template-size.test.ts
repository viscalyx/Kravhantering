import { describe, expect, it } from 'vitest'
import {
  buildRequirementImportAiRequestTemplate,
  getPromptMessage,
  type RequirementImportDestinationKind,
} from '@/lib/ai/requirement-prompt'
import { APP_LOCALES, type AppLocale } from '@/lib/locale-preference'
import { DEFAULT_REQUIREMENT_IMPORT_BUDGET } from '@/lib/requirements/import-budget'
import {
  aiRequestTemplateRulePartLengthRange,
  buildAiRequestTemplateRulePart,
  characterCount,
  formatApproximateCharacterCount,
  PERSISTENT_INSTRUCTIONS_LIMIT,
} from '@/scripts/guide/ai-request-template-size'

const CASES = APP_LOCALES.flatMap(locale =>
  (
    [
      'requirements_library',
      'requirements_specification',
    ] as const satisfies readonly RequirementImportDestinationKind[]
  ).map(destinationKind => [locale, destinationKind] as const),
)

function templateMessage(locale: AppLocale, key: string) {
  return getPromptMessage(locale, ['ai', 'prompt', 'template', key])
}

describe('buildAiRequestTemplateRulePart', () => {
  it.each(CASES)(
    'keeps the %s %s template up to the schema section and the end marker',
    (locale, destinationKind) => {
      const options = {
        budget: DEFAULT_REQUIREMENT_IMPORT_BUDGET,
        destinationKind,
        locale,
      }
      const template = buildRequirementImportAiRequestTemplate(options)
      const rulePart = buildAiRequestTemplateRulePart(options)
      const endMarker = `${templateMessage(locale, 'endMarker')}\n`
      const rules = rulePart.slice(0, -`\n\n${endMarker}`.length)

      expect(rulePart.endsWith(`\n\n${endMarker}`)).toBe(true)
      expect(template.startsWith(rules)).toBe(true)
      expect(rulePart).not.toContain(
        `\n# ${templateMessage(locale, 'schemaHeading')}\n`,
      )
      expect(rulePart).not.toContain(templateMessage(locale, 'schemaContract'))
      expect(rulePart).not.toContain('```json')
      expect(template.endsWith(endMarker)).toBe(true)
    },
  )

  it.each(CASES)(
    'fits the %s %s rule part in the persistent instructions that the user guide names',
    (locale, destinationKind) => {
      const rulePart = buildAiRequestTemplateRulePart({
        budget: DEFAULT_REQUIREMENT_IMPORT_BUDGET,
        destinationKind,
        locale,
      })

      expect(characterCount(rulePart)).toBeLessThanOrEqual(
        PERSISTENT_INSTRUCTIONS_LIMIT,
      )
    },
  )
})

describe('aiRequestTemplateRulePartLengthRange', () => {
  it('spans the shortest and longest rule part across languages and destinations', () => {
    const lengths = CASES.map(([locale, destinationKind]) =>
      characterCount(
        buildAiRequestTemplateRulePart({
          budget: DEFAULT_REQUIREMENT_IMPORT_BUDGET,
          destinationKind,
          locale,
        }),
      ),
    )

    expect(
      aiRequestTemplateRulePartLengthRange(DEFAULT_REQUIREMENT_IMPORT_BUDGET),
    ).toEqual({ max: Math.max(...lengths), min: Math.min(...lengths) })
  })
})

describe('characterCount', () => {
  it('counts code points, not UTF-16 code units', () => {
    expect(characterCount('åäö')).toBe(3)
    expect(characterCount('a😀')).toBe(2)
  })
})

describe('formatApproximateCharacterCount', () => {
  it('rounds to hundreds and groups thousands the Swedish way', () => {
    expect(formatApproximateCharacterCount(5_797)).toBe('5 800')
    expect(formatApproximateCharacterCount(7_681)).toBe('7 700')
    expect(formatApproximateCharacterCount(949)).toBe('900')
  })
})
