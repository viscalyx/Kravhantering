import { vi } from 'vitest'
import type {
  ActiveAiSafetyRuleSet,
  ActiveAiSafetyRuleTerm,
  AiSafetyTermType,
} from '@/lib/dal/ai-safety-rules'
import type { SqlServerDatabase } from '@/lib/db'

type AiSafetyModule = typeof import('@/lib/ai/safety')

function term(
  termType: AiSafetyTermType,
  termText: string,
): ActiveAiSafetyRuleTerm {
  return {
    direction: 'input_output',
    termText,
    termType,
  }
}

export const TEST_AI_SAFETY_RULE_SET: ActiveAiSafetyRuleSet = {
  rules: [
    {
      category: 'prompt_injection',
      patternKind: 'paired_terms',
      ruleId: 'instruction_override',
      terms: [
        term('action', 'ignore'),
        term('target', 'previous'),
        term('target', 'system instructions'),
      ],
      windowChars: 80,
    },
    {
      category: 'backend_leakage',
      patternKind: 'direct_markers',
      ruleId: 'sensitive_backend_leak',
      terms: [
        {
          direction: 'output',
          termText: 'authorization: bearer',
          termType: 'direct_marker',
        },
      ],
      windowChars: null,
    },
    {
      category: 'prompt_extraction',
      patternKind: 'paired_terms',
      ruleId: 'system_prompt_extraction',
      terms: [],
      windowChars: 80,
    },
    {
      category: 'encoded_smuggling',
      patternKind: 'bidirectional_pair',
      ruleId: 'encoded_smuggling',
      terms: [],
      windowChars: 120,
    },
    {
      category: 'secret_extraction',
      patternKind: 'paired_terms',
      ruleId: 'secret_extraction_request',
      terms: [],
      windowChars: 80,
    },
    {
      category: 'harmful_content',
      patternKind: 'paired_terms',
      ruleId: 'harmful_generation_request',
      terms: [],
      windowChars: 80,
    },
  ],
}

export function mockAiSafetyScreening(aiSafety: AiSafetyModule): void {
  vi.spyOn(aiSafety, 'screenAiInput').mockImplementation(
    async (_db: SqlServerDatabase, textParts: readonly string[]) =>
      aiSafety.screenAiInputWithRuleSet(TEST_AI_SAFETY_RULE_SET, textParts),
  )
  vi.spyOn(aiSafety, 'screenAiOutput').mockImplementation(
    async (_db: SqlServerDatabase, textParts: readonly string[]) =>
      aiSafety.screenAiOutputWithRuleSet(TEST_AI_SAFETY_RULE_SET, textParts),
  )
  vi.spyOn(aiSafety, 'screenAiInputDetailed').mockImplementation(
    async (_db: SqlServerDatabase, textParts) =>
      aiSafety.screenAiInputDetailedWithRuleSet(
        TEST_AI_SAFETY_RULE_SET,
        textParts,
      ),
  )
  vi.spyOn(aiSafety, 'screenAiOutputDetailed').mockImplementation(
    async (_db: SqlServerDatabase, textParts) =>
      aiSafety.screenAiOutputDetailedWithRuleSet(
        TEST_AI_SAFETY_RULE_SET,
        textParts,
      ),
  )
}
