import {
  countDeviationsBySpecification,
  createDeviation,
  DEVIATION_APPROVED,
  DEVIATION_REJECTED,
  deleteDeviation,
  listDeviationsForSpecification,
  recordDecision,
  updateDeviation,
} from '@/lib/dal/deviations'
import {
  type GraduatedRequirementResult,
  getSpecificationBySlug,
} from '@/lib/dal/requirements-specifications'
import type { SqlServerDatabase } from '@/lib/db'
import { recordCapacityEvent } from '@/lib/observability/capacity'
import { checkInMemoryThrottle } from '@/lib/observability/throttle'
import {
  type AuthorizationService,
  createDefaultAuthorizationService,
  type RequestContext,
  type RequirementsAction,
  requireHumanActorSnapshot,
} from '@/lib/requirements/auth'
import { notFoundError, validationError } from '@/lib/requirements/errors'
import type {
  RequirementSortDirection,
  RequirementSortField,
} from '@/lib/requirements/list-view'
import {
  createRequirementsLogger,
  type RequirementsLogger,
} from '@/lib/requirements/logging'
import { recordHighRiskMutationSucceeded } from '@/lib/requirements/security-audit'
import { createRequirementWorkflow } from '@/lib/requirements/service-requirements'
import {
  authorize,
  createServiceMessage,
  withLogging,
} from '@/lib/requirements/service-shared'
import { createSpecificationWorkflow } from '@/lib/requirements/service-specifications'
import { createSuggestionWorkflow } from '@/lib/requirements/service-suggestions'
import type {
  RequirementDetail,
  RequirementVersionDetail,
} from '@/lib/requirements/types'
import type { SpecificationPermissions } from '@/lib/specifications/permissions'

export { toHttpErrorPayload } from '@/lib/requirements/http-errors'

export type { RequirementListItem } from '@/lib/requirements/service-requirements'

export {
  buildRequirementViewUri,
  formatRequirementListItem,
} from '@/lib/requirements/service-requirements'

export type {
  RequirementDetail,
  RequirementVersionDetail,
} from '@/lib/requirements/types'

export type ResponseFormat = 'json' | 'markdown'
export type ResponseLocale = 'en' | 'sv'
export type CatalogKind =
  | 'requirements'
  | 'areas'
  | 'categories'
  | 'types'
  | 'quality_characteristics'
  | 'risk_levels'
  | 'specification_item_statuses'
  | 'statuses'
  | 'requirement_packages'
  | 'transitions'

const AI_SERVICE_GENERATE_RATE_LIMIT = 5
const AI_SERVICE_GENERATE_RATE_WINDOW_MS = 60_000

export interface RequirementMutationInput {
  acceptanceCriteria?: string
  areaId?: number
  baseRevisionToken?: string | null
  baseVersionId?: number | null
  categoryId?: number
  createdBy?: string
  description?: string
  normReferenceIds?: number[]
  qualityCharacteristicId?: number
  requirementPackageIds?: number[]
  requiresTesting?: boolean
  riskLevelId?: number
  typeId?: number
  verificationMethod?: string | null
}

export interface RequirementRefInput {
  id?: number
  uniqueId?: string
}

export interface QueryCatalogInput {
  areaIds?: number[]
  catalog?: CatalogKind
  categoryIds?: number[]
  descriptionSearch?: string
  includeArchived?: boolean
  limit?: number
  locale?: ResponseLocale
  normReferenceIds?: number[]
  offset?: number
  qualityCharacteristicIds?: number[]
  requirementPackageIds?: number[]
  requiresTesting?: boolean[]
  responseFormat?: ResponseFormat
  riskLevelIds?: number[]
  sortBy?: RequirementSortField
  sortDirection?: RequirementSortDirection
  statuses?: number[]
  typeId?: number
  typeIds?: number[]
  uniqueIdSearch?: string
}

export interface GetRequirementInput extends RequirementRefInput {
  locale?: ResponseLocale
  responseFormat?: ResponseFormat
  versionNumber?: number
  view?: 'detail' | 'history' | 'version'
}

export interface ManageRequirementInput extends RequirementRefInput {
  locale?: ResponseLocale
  operation:
    | 'archive'
    | 'approve_archiving'
    | 'cancel_archiving'
    | 'create'
    | 'delete_draft'
    | 'edit'
    | 'reactivate'
    | 'restore_version'
  requirement?: RequirementMutationInput
  responseFormat?: ResponseFormat
  versionNumber?: number
}

export interface TransitionRequirementInput extends RequirementRefInput {
  locale?: ResponseLocale
  responseFormat?: ResponseFormat
  toStatusId: number
}

export interface GenerateRequirementsInput {
  customInstruction?: string
  locale?: ResponseLocale
  model?: string
  reasoningEffort?: string
  scopeId?: number
  scopeType?: 'requirement_area' | 'specification'
  supportedParameters?: string[]
  topic: string
}

export interface GenerateRequirementsOutput {
  message: string
  model: string
  requirements: import('@/lib/ai/requirement-prompt').GeneratedRequirement[]
  stats: import('@/lib/ai/openrouter-client').GenerationStats
  thinking: string
}

export interface SpecificationRefInput {
  specificationId?: number
  specificationSlug?: string
}

export interface ListSpecificationsInput {
  includeRestFields?: boolean
  locale?: ResponseLocale
  nameSearch?: string
  responseFormat?: ResponseFormat
}

export interface GetSpecificationItemsInput extends SpecificationRefInput {
  descriptionSearch?: string
  locale?: ResponseLocale
  responseFormat?: ResponseFormat
}

export interface AddToSpecificationInput extends SpecificationRefInput {
  locale?: ResponseLocale
  needsReferenceDescription?: string | null
  needsReferenceId?: number | null
  needsReferenceText?: string | null
  requirementIds: number[]
  responseFormat?: ResponseFormat
}

export interface RemoveFromSpecificationInput extends SpecificationRefInput {
  locale?: ResponseLocale
  requirementIds: number[]
  responseFormat?: ResponseFormat
}

export interface ListGraduationTargetAreasInput extends SpecificationRefInput {
  locale?: ResponseLocale
  localRequirementId: number
  responseFormat?: ResponseFormat
}

export interface GraduationTargetArea {
  id: number
  name: string
  prefix: string
}

export interface ListGraduationTargetAreasOutput {
  areas: GraduationTargetArea[]
  message: string
}

export interface GraduateSpecificationLocalRequirementInput
  extends SpecificationRefInput {
  locale?: ResponseLocale
  localRequirementId: number
  requirementAreaId: number
  responseFormat?: ResponseFormat
}

export interface GraduateSpecificationLocalRequirementOutput {
  detail: RequirementDetail
  message: string
  requirementResourceUri: string
  requirementViewUri: string
  result: GraduatedRequirementResult
}

export interface ListSpecificationsOutput {
  message: string
  specifications: {
    businessNeedsReference: string | null
    createdAt?: string
    id: number
    implementationType: { id?: number; nameSv: string; nameEn: string } | null
    itemCount: number
    lifecycleStatus?: { id: number; nameSv: string; nameEn: string } | null
    name: string
    permissions?: SpecificationPermissions
    requirementAreas?: { id: number; name: string }[]
    responsibleDisplayName?: string | null
    responsibleHsaId?: string
    governanceObjectType: { id?: number; nameSv: string; nameEn: string } | null
    specificationImplementationTypeId?: number | null
    specificationLifecycleStatusId?: number | null
    specificationGovernanceObjectTypeId?: number | null
    uniqueId: string
    updatedAt?: string
  }[]
}

export interface GetSpecificationItemsOutput {
  items: {
    id: number
    uniqueId: string
    area: string | null
    category: string | null
    description: string | null
    needsReference: string | null
    status: string | null
    type: string | null
  }[]
  message: string
  specificationId: number
}

export interface AddToSpecificationOutput {
  addedCount: number
  message: string
  skippedCount: number
  skippedIds: number[]
}

export interface RemoveFromSpecificationOutput {
  message: string
  removedCount: number
}

export interface ListDeviationsOutput {
  counts: {
    approved: number
    pending: number
    rejected: number
    total: number
  }
  deviations: {
    createdAt: string
    createdBy: string | null
    decidedAt: string | null
    decidedBy: string | null
    decision: number | null
    decisionMotivation: string | null
    id: number
    motivation: string
    specificationItemId: number
    requirementDescription: string | null
    requirementUniqueId: string | null
  }[]
  message: string
}

export interface ManageDeviationOutput {
  message: string
  result: unknown
}

export interface ListSuggestionsOutput {
  counts: {
    total: number
    pending: number
    resolved: number
    dismissed: number
  }
  message: string
  suggestions: {
    content: string
    createdAt: string
    createdBy: string | null
    id: number
    requirementId: number
    requirementVersionId: number | null
    resolution: number | null
    resolutionMotivation: string | null
    resolvedAt: string | null
    resolvedBy: string | null
    isReviewRequested: number
    updatedAt: string | null
  }[]
}

export interface ManageSuggestionOutput {
  message: string
  result: unknown
}

export interface RequirementsService {
  addToSpecification(
    context: RequestContext,
    input: AddToSpecificationInput,
  ): Promise<AddToSpecificationOutput>

  generateRequirements(
    context: RequestContext,
    input: GenerateRequirementsInput,
  ): Promise<GenerateRequirementsOutput>
  getRequirement(
    context: RequestContext,
    input: GetRequirementInput,
  ): Promise<{
    message: string
    requirement: RequirementDetail
    requirementResourceUri: string
    requirementViewUri: string
    version?: RequirementVersionDetail
    versions?: RequirementDetail['versions']
  }>
  getSpecificationItems(
    context: RequestContext,
    input: GetSpecificationItemsInput,
  ): Promise<GetSpecificationItemsOutput>
  graduateSpecificationLocalRequirement(
    context: RequestContext,
    input: GraduateSpecificationLocalRequirementInput,
  ): Promise<GraduateSpecificationLocalRequirementOutput>
  listDeviations(
    context: RequestContext,
    input: {
      locale?: ResponseLocale
      specificationId?: number
      specificationSlug?: string
      responseFormat?: ResponseFormat
    },
  ): Promise<ListDeviationsOutput>
  listGraduationTargetAreas(
    context: RequestContext,
    input: ListGraduationTargetAreasInput,
  ): Promise<ListGraduationTargetAreasOutput>
  listSpecifications(
    context: RequestContext,
    input: ListSpecificationsInput,
  ): Promise<ListSpecificationsOutput>
  listSuggestions(
    context: RequestContext,
    input: {
      locale?: ResponseLocale
      requirementId?: number
      responseFormat?: ResponseFormat
      uniqueId?: string
    },
  ): Promise<ListSuggestionsOutput>
  manageDeviation(
    context: RequestContext,
    input: {
      decision?: number
      decisionMotivation?: string
      deviationId?: number
      locale?: ResponseLocale
      motivation?: string
      operation: 'create' | 'delete' | 'edit' | 'record_decision'
      specificationItemId?: number
      responseFormat?: ResponseFormat
    },
  ): Promise<ManageDeviationOutput>
  manageRequirement(
    context: RequestContext,
    input: ManageRequirementInput,
  ): Promise<{
    detail?: RequirementDetail
    message: string
    operation: ManageRequirementInput['operation']
    result: unknown
  }>
  manageSuggestion(
    context: RequestContext,
    input: {
      content?: string
      createdBy?: string | null
      suggestionId?: number
      locale?: ResponseLocale
      operation:
        | 'create'
        | 'delete'
        | 'dismiss'
        | 'edit'
        | 'request_review'
        | 'resolve'
        | 'revert_to_draft'
      requirementId?: number
      requirementVersionId?: number | null
      resolution?: number
      resolutionMotivation?: string
      resolvedBy?: string
      responseFormat?: ResponseFormat
    },
  ): Promise<ManageSuggestionOutput>
  queryCatalog(
    context: RequestContext,
    input: QueryCatalogInput,
  ): Promise<{
    catalog: CatalogKind
    items: unknown[]
    message: string
    pagination: {
      count: number
      hasMore: boolean
      limit: number
      nextOffset: number | null
      offset: number
      total: number
    } | null
  }>
  removeFromSpecification(
    context: RequestContext,
    input: RemoveFromSpecificationInput,
  ): Promise<RemoveFromSpecificationOutput>
  transitionRequirement(
    context: RequestContext,
    input: TransitionRequirementInput,
  ): Promise<{
    detail: RequirementDetail
    message: string
    version: RequirementVersionDetail
  }>
}

async function resolveSpecificationIdOrThrow(
  db: SqlServerDatabase,
  input: SpecificationRefInput,
) {
  if (input.specificationId == null && input.specificationSlug == null) {
    throw validationError('Missing specification reference', {
      specificationId: input.specificationId,
      specificationSlug: input.specificationSlug,
    })
  }

  const specificationId =
    input.specificationId != null
      ? input.specificationId
      : input.specificationSlug
        ? (await getSpecificationBySlug(db, input.specificationSlug))?.id
        : undefined

  if (specificationId == null) {
    throw notFoundError('Specification not found.', {
      specificationId: input.specificationId,
      specificationSlug: input.specificationSlug,
    })
  }

  return specificationId
}

export function createRequirementsService(
  db: SqlServerDatabase,
  {
    authorization = createDefaultAuthorizationService(db),
    logger = createRequirementsLogger(),
  }: {
    authorization?: AuthorizationService
    logger?: RequirementsLogger
  } = {},
): RequirementsService {
  return {
    ...createRequirementWorkflow({ authorization, db, logger }),

    ...createSpecificationWorkflow({ authorization, db, logger }),
    ...createSuggestionWorkflow({ authorization, db, logger }),

    async listDeviations(context, input) {
      const responseFormat = input.responseFormat ?? 'markdown'
      const locale = input.locale ?? 'en'

      await authorize(
        authorization,
        {
          kind: 'list_deviations',
          specificationId: input.specificationId,
          specificationSlug: input.specificationSlug,
        } as RequirementsAction,
        context,
      )

      return withLogging(
        logger,
        context,
        'requirements.list_deviations',
        {
          specification_id: input.specificationId ?? null,
          specification_slug: input.specificationSlug ?? null,
        },
        async () => {
          const specificationId = await resolveSpecificationIdOrThrow(db, input)
          const rows = await listDeviationsForSpecification(db, specificationId)
          const counts = await countDeviationsBySpecification(
            db,
            specificationId,
          )

          const title = locale === 'sv' ? 'Avvikelser' : 'Deviations'
          const summary =
            locale === 'sv'
              ? `${counts.total} avvikelse(r): ${counts.pending} väntande, ${counts.approved} godkända, ${counts.rejected} avvisade.`
              : `${counts.total} deviation(s): ${counts.pending} pending, ${counts.approved} approved, ${counts.rejected} rejected.`

          return {
            counts,
            deviations: rows.map(r => ({
              createdAt: r.createdAt,
              createdBy: r.createdBy,
              decidedAt: r.decidedAt,
              decidedBy: r.decidedBy,
              decision: r.decision,
              decisionMotivation: r.decisionMotivation,
              id: r.id,
              motivation: r.motivation,
              specificationItemId:
                r.specificationItemId ??
                (r.specificationLocalRequirementId != null
                  ? -r.specificationLocalRequirementId
                  : -r.id),
              requirementDescription: r.requirementDescription,
              requirementUniqueId: r.requirementUniqueId,
            })),
            message: createServiceMessage(title, [summary], responseFormat),
          }
        },
      )
    },

    async manageDeviation(context, input) {
      const responseFormat = input.responseFormat ?? 'markdown'
      const locale = input.locale ?? 'en'

      await authorize(
        authorization,
        {
          kind: 'manage_deviation',
          operation: input.operation,
          deviationId: input.deviationId,
          specificationItemId: input.specificationItemId,
        } as RequirementsAction,
        context,
      )

      return withLogging(
        logger,
        context,
        'requirements.manage_deviation',
        {
          operation: input.operation,
          deviation_id: input.deviationId ?? null,
          specification_item_id: input.specificationItemId ?? null,
        },
        async () => {
          if (input.operation === 'create') {
            if (!input.specificationItemId) {
              throw validationError('Requirement application ID is required')
            }
            const trimmedMotivation = input.motivation?.trim()
            if (!trimmedMotivation) {
              throw validationError('Motivation is required')
            }
            const actor = requireHumanActorSnapshot(context)
            const result = await createDeviation(db, {
              specificationItemId: input.specificationItemId,
              motivation: trimmedMotivation,
              createdBy: actor.displayName,
              createdByHsaId: actor.hsaId,
            })
            const summary =
              locale === 'sv'
                ? `Avvikelse registrerad (ID ${result.id}).`
                : `Deviation registered (ID ${result.id}).`
            return {
              message: createServiceMessage(
                locale === 'sv' ? 'Avvikelse' : 'Deviation',
                [summary],
                responseFormat,
              ),
              result,
            }
          }

          if (!input.deviationId) {
            throw validationError('Deviation ID is required')
          }

          if (input.operation === 'edit') {
            const trimmedMotivation = input.motivation?.trim()
            if (!trimmedMotivation) {
              throw validationError('Motivation is required for editing')
            }
            await updateDeviation(db, input.deviationId, {
              motivation: trimmedMotivation,
            })
            const summary =
              locale === 'sv'
                ? `Avvikelse ${input.deviationId} uppdaterad.`
                : `Deviation ${input.deviationId} updated.`
            return {
              message: createServiceMessage(
                locale === 'sv' ? 'Avvikelse' : 'Deviation',
                [summary],
                responseFormat,
              ),
              result: { id: input.deviationId },
            }
          }

          if (input.operation === 'record_decision') {
            const trimmedDecisionMotivation = input.decisionMotivation?.trim()
            if (input.decision == null || !trimmedDecisionMotivation) {
              throw validationError(
                'Decision and decision motivation are required',
              )
            }
            if (
              input.decision !== DEVIATION_APPROVED &&
              input.decision !== DEVIATION_REJECTED
            ) {
              throw validationError('Invalid decision value')
            }
            const actor = requireHumanActorSnapshot(context)
            await recordDecision(db, input.deviationId, {
              decision: input.decision,
              decisionMotivation: trimmedDecisionMotivation,
              decidedBy: actor.displayName,
              decidedByHsaId: actor.hsaId,
            })
            await recordHighRiskMutationSucceeded(context, {
              action: 'deviation.decision.recorded',
              decision: input.decision,
              deviationId: input.deviationId,
              operation: input.operation,
            })
            const decisionLabel =
              input.decision === DEVIATION_APPROVED
                ? locale === 'sv'
                  ? 'godkänd'
                  : 'approved'
                : locale === 'sv'
                  ? 'avvisad'
                  : 'rejected'
            const summary =
              locale === 'sv'
                ? `Beslut registrerat för avvikelse ${input.deviationId}: ${decisionLabel}.`
                : `Decision recorded for deviation ${input.deviationId}: ${decisionLabel}.`
            return {
              message: createServiceMessage(
                locale === 'sv' ? 'Avvikelsebeslut' : 'Deviation Decision',
                [summary],
                responseFormat,
              ),
              result: { id: input.deviationId, decision: input.decision },
            }
          }

          // delete
          await deleteDeviation(db, input.deviationId)
          await recordHighRiskMutationSucceeded(context, {
            action: 'deviation.deleted',
            deviationId: input.deviationId,
            operation: input.operation,
          })
          const summary =
            locale === 'sv'
              ? `Avvikelse ${input.deviationId} borttagen.`
              : `Deviation ${input.deviationId} deleted.`
          return {
            message: createServiceMessage(
              locale === 'sv' ? 'Avvikelse' : 'Deviation',
              [summary],
              responseFormat,
            ),
            result: { id: input.deviationId },
          }
        },
      )
    },

    async generateRequirements(context, input) {
      const locale = input.locale ?? 'en'
      const topic = (input.topic ?? '').trim()
      const customInstruction = (input.customInstruction ?? '').trim()

      const MAX_TOPIC_LENGTH = 1000
      const MAX_CUSTOM_INSTRUCTION_LENGTH = 5000

      if (!topic) {
        throw validationError('topic is required and cannot be empty')
      }
      if (topic.length > MAX_TOPIC_LENGTH) {
        throw validationError(
          `topic must not exceed ${MAX_TOPIC_LENGTH} characters`,
        )
      }
      if (customInstruction.length > MAX_CUSTOM_INSTRUCTION_LENGTH) {
        throw validationError(
          `customInstruction must not exceed ${MAX_CUSTOM_INSTRUCTION_LENGTH} characters`,
        )
      }

      await authorize(
        authorization,
        {
          kind: 'generate_requirements',
          scopeId: input.scopeId,
          scopeType: input.scopeType,
        },
        context,
      )
      const throttle = checkInMemoryThrottle({
        key: [
          'requirements.generate_requirements',
          context.source,
          context.actor.source,
          context.actor.id ?? context.actor.hsaId ?? context.correlationId,
        ].join(':'),
        limit: AI_SERVICE_GENERATE_RATE_LIMIT,
        windowMs: AI_SERVICE_GENERATE_RATE_WINDOW_MS,
      })

      if (!throttle.allowed) {
        recordCapacityEvent({
          correlationId: context.correlationId,
          event: 'capacity.throttled',
          level: 'warn',
          metrics: { throttled: true },
          operation: 'requirements.generate_requirements',
          outcome: 'throttled',
          requestId: context.requestId,
          retryAfterSeconds: throttle.retryAfterSeconds,
          source: context.source,
          statusCode: 429,
          toolName: context.toolName,
        })
        throw validationError(
          'Too many AI generation requests. Try again later.',
          {
            reason: 'rate_limited',
            retryAfterSeconds: throttle.retryAfterSeconds,
          },
        )
      }

      return withLogging(
        logger,
        context,
        'requirements.generate_requirements',
        { topicLength: topic.length, model: input.model },
        async () => {
          const { loadTaxonomy } = await import('@/lib/ai/taxonomy')
          const taxonomy = await loadTaxonomy(db, locale as 'en' | 'sv')

          const {
            buildSystemPrompt,
            buildUserPrompt,
            REQUIREMENT_FORMAT_SCHEMA,
            validateGeneratedRequirements,
          } = await import('@/lib/ai/requirement-prompt')
          const { generateChat } = await import('@/lib/ai/openrouter-client')

          const systemPrompt = buildSystemPrompt(
            taxonomy,
            locale as 'en' | 'sv',
          )
          const userPrompt = buildUserPrompt(
            topic,
            customInstruction || undefined,
            locale as 'en' | 'sv',
          )

          const resolvedModel =
            input.model ||
            process.env.NEXT_PUBLIC_DEFAULT_MODEL ||
            'anthropic/claude-sonnet-4'

          const result = await generateChat<{
            requirements: import('@/lib/ai/requirement-prompt').GeneratedRequirement[]
          }>({
            format: REQUIREMENT_FORMAT_SCHEMA,
            messages: [
              { content: systemPrompt, role: 'system' },
              { content: userPrompt, role: 'user' },
            ],
            model: resolvedModel,
            reasoningEffort: input.reasoningEffort,
            supportedParameters: input.supportedParameters,
          })

          if (!result?.content || !Array.isArray(result.content.requirements)) {
            throw validationError(
              'AI model returned an invalid response: missing requirements array',
            )
          }

          const validated = validateGeneratedRequirements(
            result.content.requirements,
            taxonomy,
          )

          if (
            validated.length === 0 &&
            result.content.requirements.length > 0
          ) {
            throw validationError(
              'No valid requirements after taxonomy validation',
            )
          }

          const message =
            locale === 'sv'
              ? `Genererade ${validated.length} krav för ämne: ${topic}`
              : `Generated ${validated.length} requirements for topic: ${topic}`

          return {
            message,
            model: resolvedModel,
            requirements: validated,
            stats: result.stats,
            thinking: result.thinking,
          }
        },
      )
    },
  }
}

export function toResponseFormat(format?: string): ResponseFormat {
  return format === 'json' ? 'json' : 'markdown'
}

export function toResponseLocale(locale?: string): ResponseLocale {
  return locale === 'sv' ? 'sv' : 'en'
}
