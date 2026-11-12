import {
  buildRequirementImportAiRequestTemplate,
  getPromptMessage,
  type RequirementImportDestinationKind,
} from '@/lib/ai/requirement-prompt'
import { APP_LOCALES, type AppLocale } from '@/lib/locale-preference'
import type { RequirementImportBudget } from '@/lib/requirements/import-budget'

const DESTINATION_KINDS = [
  'requirements_library',
  'requirements_specification',
] as const satisfies readonly RequirementImportDestinationKind[]

/**
 * The most characters that the persistent instructions of a Microsoft 365
 * agent hold. The user guide says that the rule part fits there.
 */
export const PERSISTENT_INSTRUCTIONS_LIMIT = 8_000

interface AiRequestTemplateRulePartOptions {
  budget: RequirementImportBudget
  destinationKind: RequirementImportDestinationKind
  locale: AppLocale
}

function templateMessage(locale: AppLocale, key: string): string {
  return getPromptMessage(locale, ['ai', 'prompt', 'template', key])
}

/**
 * The AI request template without its schema section: everything from the
 * start marker to the end marker except the schema heading, the output
 * contract text, and the `json` code block. This is the part a user can keep
 * in persistent instructions, such as the instructions of an AI agent.
 */
export function buildAiRequestTemplateRulePart({
  budget,
  destinationKind,
  locale,
}: AiRequestTemplateRulePartOptions): string {
  const template = buildRequirementImportAiRequestTemplate({
    budget,
    destinationKind,
    locale,
  })
  const schemaSection = `\n\n# ${templateMessage(locale, 'schemaHeading')}\n\n`
  const schemaStart = template.indexOf(schemaSection)
  if (schemaStart < 0) {
    throw new Error(`The ${locale} template has no schema section.`)
  }
  return `${template.slice(0, schemaStart)}\n\n${templateMessage(locale, 'endMarker')}\n`
}

/** Counts characters as Unicode code points. */
export function characterCount(text: string): number {
  return [...text].length
}

/**
 * The smallest and largest rule part length, in characters, across both
 * languages and both destination kinds.
 */
export function aiRequestTemplateRulePartLengthRange(
  budget: RequirementImportBudget,
): { max: number; min: number } {
  const lengths = APP_LOCALES.flatMap(locale =>
    DESTINATION_KINDS.map(destinationKind =>
      characterCount(
        buildAiRequestTemplateRulePart({ budget, destinationKind, locale }),
      ),
    ),
  )
  return { max: Math.max(...lengths), min: Math.min(...lengths) }
}

/** Formats a character count rounded to hundreds, for example `5 800`. */
export function formatApproximateCharacterCount(count: number): string {
  return (Math.round(count / 100) * 100).toLocaleString('sv-SE')
}
