import type { MutationPolicy } from '@/lib/http/secure-mutation-route'
import { requirementsMutationPolicy } from '@/lib/http/secure-mutation-route'

interface RequirementSelectionQuestionParams {
  id: number | string
}

interface RequirementSelectionAnswerParams
  extends RequirementSelectionQuestionParams {
  answerId: number
}

export function requirementSelectionQuestionCreatePolicy<
  TBody extends { areaId: number },
>(): MutationPolicy<TBody, undefined> {
  return requirementsMutationPolicy(({ body }) => ({
    areaId: body.areaId,
    kind: 'manage_requirement_selection_question',
    operation: 'create',
  }))
}

export function requirementSelectionQuestionPolicy<TBody = unknown>(
  operation: string,
): MutationPolicy<TBody, RequirementSelectionQuestionParams> {
  return requirementsMutationPolicy(({ params }) => ({
    kind: 'manage_requirement_selection_question',
    operation,
    questionId: params.id,
  }))
}

export function requirementSelectionAnswerPolicy<TBody = unknown>(
  operation: string,
): MutationPolicy<TBody, RequirementSelectionAnswerParams> {
  return requirementsMutationPolicy(({ params }) => ({
    answerId: params.answerId,
    kind: 'manage_requirement_selection_question',
    operation,
    questionId: params.id,
  }))
}
