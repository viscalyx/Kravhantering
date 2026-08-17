import { recordAllowedActionAuditEvent } from '@/lib/audit/action-audit'
import {
  listSpecificationRequirementSelectionQuestions,
  replaceSpecificationRequirementSelectionAnswersWithExecutor,
  type SpecificationRequirementSelectionQuestionRow,
} from '@/lib/dal/requirement-selection-questions'
import { findSpecificationIdentity } from '@/lib/dal/requirements-specifications'
import type { SqlServerDatabase } from '@/lib/db'
import { DELETED_USER_INTERNAL_NAME } from '@/lib/privacy/display-name'
import type {
  AuthorizationService,
  RequestContext,
  RequirementsAction,
} from '@/lib/requirements/auth'
import { notFoundError } from '@/lib/requirements/errors'
import { authorize } from '@/lib/requirements/service-shared'

export interface ReplaceSpecificationRequirementSelectionAnswersInput {
  answerIds: number[]
  confirmHiddenAnswerClear?: boolean
  questionId: number
  specificationId: number
}

interface Dependencies {
  authorization: AuthorizationService
  db: SqlServerDatabase
}

export interface SpecificationRequirementSelectionAnswerMutationWorkflow {
  replace(
    context: RequestContext,
    input: ReplaceSpecificationRequirementSelectionAnswersInput,
  ): Promise<SpecificationRequirementSelectionQuestionRow[]>
}

function replacementAction(
  specificationId: number,
): Extract<
  RequirementsAction,
  { kind: 'manage_specification_requirement_selection_answers' }
> {
  return {
    kind: 'manage_specification_requirement_selection_answers',
    operation: 'replace',
    specificationId,
  }
}

export function createSpecificationRequirementSelectionAnswerMutationWorkflow({
  authorization,
  db,
}: Dependencies): SpecificationRequirementSelectionAnswerMutationWorkflow {
  return {
    async replace(
      context: RequestContext,
      input: ReplaceSpecificationRequirementSelectionAnswersInput,
    ): Promise<SpecificationRequirementSelectionQuestionRow[]> {
      const action = replacementAction(input.specificationId)
      await authorize(authorization, action, context)

      return db.transaction(async manager => {
        const specification = await findSpecificationIdentity(
          manager,
          input.specificationId,
        )
        if (!specification) {
          throw notFoundError('Requirements specification not found', {
            specificationId: input.specificationId,
          })
        }

        await replaceSpecificationRequirementSelectionAnswersWithExecutor(
          manager,
          specification.id,
          input.questionId,
          input.answerIds,
          {
            displayName:
              context.actor.displayName.trim() ||
              context.actor.id ||
              DELETED_USER_INTERNAL_NAME,
            hsaId: context.actor.hsaId,
          },
          { confirmHiddenAnswerClear: input.confirmHiddenAnswerClear },
        )
        await recordAllowedActionAuditEvent(manager, context, {
          action: 'specification_requirement_selection_answer.replace',
          details: {
            answerCount: input.answerIds.length,
            questionId: input.questionId,
          },
          targetId: specification.id,
          targetKind: 'requirements_specification',
        })

        return listSpecificationRequirementSelectionQuestions(
          manager,
          specification.id,
        )
      })
    },
  }
}
