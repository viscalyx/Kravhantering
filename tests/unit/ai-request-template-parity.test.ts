import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildRequirementImportAiInstruction,
  buildRequirementImportAiRequestTemplate,
  buildRequirementImportInstruction,
  buildRequirementImportInstructionRules,
  buildRequirementImportRoleIntro,
  buildRequirementImportRuleOrder,
  buildRequirementImportSystemPrompt,
  buildRequirementImportUserPrompt,
  type RequirementImportDestinationKind,
} from '@/lib/ai/requirement-prompt'
import type { AppLocale } from '@/lib/locale-preference'
import type { RequestContext } from '@/lib/requirements/auth'
import type { RequirementImportBudget } from '@/lib/requirements/import-budget'
import { buildRequirementsImportJsonSchema } from '@/lib/requirements/import-schema'

const routeMocks = vi.hoisted(() => ({
  createRequirementsRestRuntime: vi.fn(),
  getImportSchema: vi.fn(),
}))

vi.mock('@/lib/requirements/server', () => ({
  createRequirementsRestRuntime: routeMocks.createRequirementsRestRuntime,
}))

import { GET as getImportSchemaRoute } from '@/app/api/requirements/import/schema/route'

const LOCALES = ['en', 'sv'] as const
const DESTINATION_KINDS = [
  'requirements_library',
  'requirements_specification',
] as const satisfies readonly RequirementImportDestinationKind[]
const CASES = LOCALES.flatMap(locale =>
  DESTINATION_KINDS.map(destinationKind => [locale, destinationKind] as const),
)

const BUDGET: RequirementImportBudget = {
  maxJsonDepth: 7,
  maxNestedItems: 43,
  maxProposedNeedsReferences: 29,
  maxProposedNormReferences: 31,
  maxRows: 37,
}

const REFERENCE_DATA = {
  categories: [{ id: 1, name: 'Parity category' }],
}

function internalSystemPrompt(
  locale: AppLocale,
  destinationKind: RequirementImportDestinationKind,
) {
  return buildRequirementImportSystemPrompt(
    buildRequirementImportInstruction({
      budget: BUDGET,
      destinationKind,
      locale,
      referenceData: REFERENCE_DATA,
    }),
    locale,
  )
}

function schemaCodeBlock(template: string): string {
  const blocks = [...template.matchAll(/```json\n([\s\S]*?)\n```/gu)]
  expect(blocks).toHaveLength(1)
  return blocks[0]?.[1] ?? ''
}

function makeContext(): RequestContext {
  return {
    actor: {
      displayName: 'Parity Tester',
      hsaId: 'SE5560000001-parity',
      id: 'parity-test',
      isAuthenticated: true,
      roles: ['RequirementsEditor'],
      source: 'oidc',
    },
    correlationId: 'correlation-parity',
    requestId: 'request-parity',
    source: 'rest',
  }
}

describe('AI request template parity with the internal AI request', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it.each(CASES)(
    'embeds the same shared parts as the internal system prompt for %s %s',
    (locale, destinationKind) => {
      const systemPrompt = internalSystemPrompt(locale, destinationKind)
      const template = buildRequirementImportAiRequestTemplate({
        budget: BUDGET,
        destinationKind,
        locale,
      })
      const sharedParts = [
        buildRequirementImportRoleIntro(locale),
        buildRequirementImportRuleOrder(locale),
        buildRequirementImportInstructionRules({
          budget: BUDGET,
          destinationKind,
          locale,
        }),
      ]

      for (const part of sharedParts) {
        expect(systemPrompt).toContain(part)
        expect(template).toContain(part)
      }
    },
  )

  it.each(CASES)(
    'embeds the AI instruction of the internal user prompt for %s %s',
    (locale, destinationKind) => {
      const aiInstruction = buildRequirementImportAiInstruction(locale)
      const userPrompt = buildRequirementImportUserPrompt({
        locale,
        need: 'Parity need',
      })
      const template = buildRequirementImportAiRequestTemplate({
        budget: BUDGET,
        destinationKind,
        locale,
      })

      expect(userPrompt).toContain(aiInstruction)
      expect(template).toContain(aiInstruction)
    },
  )

  it.each(CASES)(
    'keeps the destination rules of the other destination kind out of the %s %s template',
    (locale, destinationKind) => {
      const otherKind = DESTINATION_KINDS.find(kind => kind !== destinationKind)
      const template = buildRequirementImportAiRequestTemplate({
        budget: BUDGET,
        destinationKind,
        locale,
      })

      expect(template).not.toContain(
        buildRequirementImportInstructionRules({
          budget: BUDGET,
          destinationKind: otherKind ?? destinationKind,
          locale,
        }),
      )
    },
  )

  it.each(LOCALES)(
    'embeds the same schema bytes as the %s schema download for the same budget',
    async locale => {
      routeMocks.createRequirementsRestRuntime.mockResolvedValue({
        context: makeContext(),
        service: { getImportSchema: routeMocks.getImportSchema },
      })
      routeMocks.getImportSchema.mockResolvedValue(
        buildRequirementsImportJsonSchema(locale, BUDGET),
      )

      const response = await getImportSchemaRoute(
        new Request(
          `http://localhost/api/requirements/import/schema?locale=${locale}`,
        ),
      )
      const schemaDownload = await response.text()

      for (const destinationKind of DESTINATION_KINDS) {
        const template = buildRequirementImportAiRequestTemplate({
          budget: BUDGET,
          destinationKind,
          locale,
        })
        expect(schemaCodeBlock(template)).toBe(schemaDownload)
      }
      expect(routeMocks.getImportSchema).toHaveBeenCalledWith(makeContext(), {
        locale,
      })
    },
  )
})
