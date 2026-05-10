import {
  countSuggestionsByRequirement,
  createSuggestion,
  deleteSuggestion,
  listSuggestionsForRequirement,
  recordResolution,
  requestReview,
  revertToDraft,
  SUGGESTION_DISMISSED,
  SUGGESTION_RESOLVED,
  updateSuggestion,
} from '@/lib/dal/improvement-suggestions'
import { getRequirementByUniqueId } from '@/lib/dal/requirements'
import type { SqlServerDatabase } from '@/lib/db'
import type {
  AuthorizationService,
  RequirementsAction,
} from '@/lib/requirements/auth'
import { notFoundError, validationError } from '@/lib/requirements/errors'
import type { RequirementsLogger } from '@/lib/requirements/logging'
import { recordHighRiskMutationSucceeded } from '@/lib/requirements/security-audit'
import type { RequirementsService } from '@/lib/requirements/service'
import {
  authorize,
  createServiceMessage,
  withLogging,
} from '@/lib/requirements/service-shared'

interface SuggestionWorkflowDependencies {
  authorization: AuthorizationService
  db: SqlServerDatabase
  logger: RequirementsLogger
}

export function createSuggestionWorkflow({
  authorization,
  db,
  logger,
}: SuggestionWorkflowDependencies): Pick<
  RequirementsService,
  'listSuggestions' | 'manageSuggestion'
> {
  return {
    async listSuggestions(context, input) {
      const responseFormat = input.responseFormat ?? 'markdown'
      const locale = input.locale ?? 'en'

      await authorize(
        authorization,
        {
          kind: 'list_suggestions',
          requirementId: input.requirementId,
          uniqueId: input.uniqueId,
        } as RequirementsAction,
        context,
      )

      return withLogging(
        logger,
        context,
        'requirements.list_suggestions',
        {
          requirement_id: input.requirementId ?? null,
          unique_id: input.uniqueId ?? null,
        },
        async () => {
          let requirementId = input.requirementId
          if (!requirementId && input.uniqueId) {
            const req = await getRequirementByUniqueId(db, input.uniqueId)
            if (!req) {
              throw notFoundError(`Requirement not found: ${input.uniqueId}`)
            }
            requirementId = req.id
          }
          if (!requirementId) {
            throw validationError(
              'Either requirementId or uniqueId is required',
            )
          }
          const rows = await listSuggestionsForRequirement(db, requirementId)
          const counts = await countSuggestionsByRequirement(db, requirementId)

          const title =
            locale === 'sv' ? 'Förbättringsförslag' : 'Improvement suggestions'
          const summary =
            locale === 'sv'
              ? `${counts.total} förbättringsförslag: ${counts.pending} väntande, ${counts.resolved} åtgärdade, ${counts.dismissed} avvisade.`
              : `${counts.total} improvement suggestion(s): ${counts.pending} pending, ${counts.resolved} resolved, ${counts.dismissed} dismissed.`

          return {
            counts,
            suggestions: rows.map(r => ({
              content: r.content,
              createdAt: r.createdAt,
              createdBy: r.createdBy,
              id: r.id,
              requirementId: r.requirementId,
              requirementVersionId: r.requirementVersionId,
              resolution: r.resolution,
              resolutionMotivation: r.resolutionMotivation,
              resolvedAt: r.resolvedAt,
              resolvedBy: r.resolvedBy,
              isReviewRequested: r.isReviewRequested,
              updatedAt: r.updatedAt,
            })),
            message: createServiceMessage(title, [summary], responseFormat),
          }
        },
      )
    },

    async manageSuggestion(context, input) {
      const responseFormat = input.responseFormat ?? 'markdown'
      const locale = input.locale ?? 'en'

      await authorize(
        authorization,
        {
          kind: 'manage_suggestion',
          operation: input.operation,
          suggestionId: input.suggestionId,
          requirementId: input.requirementId,
        } as RequirementsAction,
        context,
      )

      return withLogging(
        logger,
        context,
        'requirements.manage_suggestion',
        {
          operation: input.operation,
          suggestion_id: input.suggestionId ?? null,
          requirement_id: input.requirementId ?? null,
        },
        async () => {
          if (input.operation === 'create') {
            if (!input.requirementId) {
              throw validationError('Requirement ID is required')
            }
            const trimmedContent = input.content?.trim()
            if (!trimmedContent) {
              throw validationError('Content is required')
            }
            const result = await createSuggestion(db, {
              requirementId: input.requirementId,
              content: trimmedContent,
              createdBy:
                input.createdBy === null
                  ? null
                  : (input.createdBy ?? context.actor.id ?? null),
              requirementVersionId: input.requirementVersionId ?? null,
            })
            const summary =
              locale === 'sv'
                ? `Förbättringsförslag registrerat (ID ${result.id}).`
                : `Improvement suggestion registered (ID ${result.id}).`
            return {
              message: createServiceMessage(
                locale === 'sv'
                  ? 'Förbättringsförslag'
                  : 'Improvement suggestion',
                [summary],
                responseFormat,
              ),
              result,
            }
          }

          if (!input.suggestionId) {
            throw validationError('Suggestion ID is required')
          }

          if (input.operation === 'edit') {
            const trimmedContent = input.content?.trim()
            if (!trimmedContent) {
              throw validationError('Content is required for editing')
            }
            await updateSuggestion(db, input.suggestionId, {
              content: trimmedContent,
            })
            const summary =
              locale === 'sv'
                ? `Förbättringsförslag ${input.suggestionId} uppdaterat.`
                : `Improvement suggestion ${input.suggestionId} updated.`
            return {
              message: createServiceMessage(
                locale === 'sv'
                  ? 'Förbättringsförslag'
                  : 'Improvement suggestion',
                [summary],
                responseFormat,
              ),
              result: { id: input.suggestionId },
            }
          }

          if (input.operation === 'request_review') {
            await requestReview(db, input.suggestionId)
            const summary =
              locale === 'sv'
                ? `Förbättringsförslag ${input.suggestionId} skickat för granskning.`
                : `Improvement suggestion ${input.suggestionId} sent for review.`
            return {
              message: createServiceMessage(
                locale === 'sv'
                  ? 'Förbättringsförslag'
                  : 'Improvement suggestion',
                [summary],
                responseFormat,
              ),
              result: { id: input.suggestionId },
            }
          }

          if (input.operation === 'revert_to_draft') {
            await revertToDraft(db, input.suggestionId)
            const summary =
              locale === 'sv'
                ? `Förbättringsförslag ${input.suggestionId} återställt till utkast.`
                : `Improvement suggestion ${input.suggestionId} reverted to draft.`
            return {
              message: createServiceMessage(
                locale === 'sv'
                  ? 'Förbättringsförslag'
                  : 'Improvement suggestion',
                [summary],
                responseFormat,
              ),
              result: { id: input.suggestionId },
            }
          }

          if (input.operation === 'resolve' || input.operation === 'dismiss') {
            const resolution =
              input.operation === 'resolve'
                ? SUGGESTION_RESOLVED
                : SUGGESTION_DISMISSED
            const trimmedMotivation = input.resolutionMotivation?.trim()
            if (!trimmedMotivation) {
              throw validationError('Resolution motivation is required')
            }
            const resolvedBy = input.resolvedBy ?? context.actor.id ?? undefined
            if (!resolvedBy) {
              throw validationError('Resolved-by is required')
            }
            await recordResolution(db, input.suggestionId, {
              resolution,
              resolutionMotivation: trimmedMotivation,
              resolvedBy,
            })
            recordHighRiskMutationSucceeded(context, {
              action: 'suggestion.resolution.recorded',
              operation: input.operation,
              resolution,
              suggestionId: input.suggestionId,
            })
            const resolutionLabel =
              resolution === SUGGESTION_RESOLVED
                ? locale === 'sv'
                  ? 'åtgärdat'
                  : 'resolved'
                : locale === 'sv'
                  ? 'avvisat'
                  : 'dismissed'
            const summary =
              locale === 'sv'
                ? `Förbättringsförslag ${input.suggestionId} ${resolutionLabel}.`
                : `Improvement suggestion ${input.suggestionId} ${resolutionLabel}.`
            return {
              message: createServiceMessage(
                locale === 'sv'
                  ? 'Förbättringsförslag'
                  : 'Improvement suggestion',
                [summary],
                responseFormat,
              ),
              result: {
                id: input.suggestionId,
                resolution,
              },
            }
          }

          await deleteSuggestion(db, input.suggestionId)
          recordHighRiskMutationSucceeded(context, {
            action: 'suggestion.deleted',
            operation: input.operation,
            suggestionId: input.suggestionId,
          })
          const summary =
            locale === 'sv'
              ? `Förbättringsförslag ${input.suggestionId} borttaget.`
              : `Improvement suggestion ${input.suggestionId} deleted.`
          return {
            message: createServiceMessage(
              locale === 'sv'
                ? 'Förbättringsförslag'
                : 'Improvement suggestion',
              [summary],
              responseFormat,
            ),
            result: { id: input.suggestionId },
          }
        },
      )
    },
  }
}
