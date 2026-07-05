import { getRequestSqlServerDataSource, type SqlServerDatabase } from '@/lib/db'
import type {
  AuthorizationService,
  RequestContext,
  RequirementsAction,
} from '@/lib/requirements/auth'
import {
  forbiddenError,
  notFoundError,
  unauthorizedError,
  validationError,
} from '@/lib/requirements/errors'
import {
  STATUS_ARCHIVED,
  STATUS_PUBLISHED,
  STATUS_REVIEW,
} from '@/lib/requirements/status-constants.mjs'

type DatabaseProvider = () => Promise<SqlServerDatabase>

export interface RequirementTarget {
  areaId: number
  hasPublishedVersion: boolean
  id: number
  latestStatusId: number | null
  uniqueId: string
}

export interface DeviationTarget {
  createdByHsaId: string | null
  specificationId: number
}

export interface SpecificationReference {
  specificationId?: number
  specificationSlug?: string
}

export interface RequirementReference {
  id?: number
  uniqueId?: string
}

export interface AssignmentLookup {
  isRequirementAreaAuthor(areaId: number, actorHsaId: string): Promise<boolean>
  isSpecificationAuthor(
    specificationId: number,
    actorHsaId: string,
  ): Promise<boolean>
  resolveDeviationTarget(
    action: Extract<RequirementsAction, { kind: 'manage_deviation' }>,
  ): Promise<DeviationTarget>
  resolveRequirementTarget(
    input: RequirementReference,
  ): Promise<RequirementTarget>
  resolveRfiQuestionArea(
    action: Extract<RequirementsAction, { kind: 'manage_rfi_question' }>,
  ): Promise<number>
  resolveRfiQuestionSuggestionArea(
    action: Extract<
      RequirementsAction,
      { kind: 'manage_rfi_question_suggestion' }
    >,
  ): Promise<number>
  resolveSpecificationId(input: SpecificationReference): Promise<number>
  resolveSpecificationIdForLocalRequirement(
    localRequirementId?: number,
    specificationSlug?: string,
  ): Promise<number>
  resolveSuggestionRequirementArea(
    action:
      | Extract<RequirementsAction, { kind: 'list_suggestions' }>
      | Extract<RequirementsAction, { kind: 'manage_suggestion' }>,
  ): Promise<number>
}

function hasRole(context: RequestContext, role: string): boolean {
  return context.actor.roles.includes(role)
}

function requireAuthenticated(context: RequestContext): void {
  if (!context.actor.isAuthenticated) {
    throw unauthorizedError()
  }
}

function requireActorHsaId(context: RequestContext, reason: string): string {
  const hsaId = context.actor.hsaId?.trim()
  if (!hsaId) {
    throw forbiddenError('Verified actor HSA-id is required', { reason })
  }
  return hsaId
}

function firstNumber(rows: Array<Record<string, unknown>>, key: string) {
  const value = rows[0]?.[key]
  return value == null ? null : Number(value)
}

function firstString(rows: Array<Record<string, unknown>>, key: string) {
  const value = rows[0]?.[key]
  return value == null ? null : String(value)
}

function numericFlag(value: unknown): boolean {
  if (typeof value === 'boolean') return value
  return Number(value) === 1
}

function isAssignmentLookup(value: unknown): value is AssignmentLookup {
  return (
    typeof value === 'object' &&
    value !== null &&
    'isRequirementAreaAuthor' in value &&
    'isSpecificationAuthor' in value &&
    'resolveRequirementTarget' in value
  )
}

export class SqlAssignmentLookup implements AssignmentLookup {
  private readonly getDb: DatabaseProvider

  constructor(dbOrProvider?: SqlServerDatabase | DatabaseProvider) {
    this.getDb =
      typeof dbOrProvider === 'function'
        ? dbOrProvider
        : dbOrProvider
          ? async () => dbOrProvider
          : getRequestSqlServerDataSource
  }

  async isSpecificationAuthor(
    specificationId: number,
    actorHsaId: string,
  ): Promise<boolean> {
    const db = await this.getDb()
    const rows = (await db.query(
      `
        SELECT TOP (1) specification_record.id AS id
        FROM requirements_specifications specification_record
        LEFT JOIN specification_co_authors co_author
          ON co_author.specification_id = specification_record.id
        WHERE specification_record.id = @0
          AND (
            specification_record.responsible_hsa_id = @1
            OR co_author.hsa_id = @1
          )
      `,
      [specificationId, actorHsaId],
    )) as Array<Record<string, unknown>>
    return rows.length > 0
  }

  async isRequirementAreaAuthor(
    areaId: number,
    actorHsaId: string,
  ): Promise<boolean> {
    const db = await this.getDb()
    const rows = (await db.query(
      `
        SELECT TOP (1) area.id AS id
        FROM requirement_areas area
        LEFT JOIN requirement_area_co_authors co_author
          ON co_author.area_id = area.id
        WHERE area.id = @0
          AND (area.owner_hsa_id = @1 OR co_author.hsa_id = @1)
      `,
      [areaId, actorHsaId],
    )) as Array<Record<string, unknown>>
    return rows.length > 0
  }

  async resolveSpecificationId(input: SpecificationReference): Promise<number> {
    if (input.specificationId != null) return input.specificationId
    if (!input.specificationSlug) {
      throw validationError('Missing specification reference', {
        reason: 'missing_specification_reference',
      })
    }
    const db = await this.getDb()
    const rows = (await db.query(
      `
        SELECT TOP (1) id
        FROM requirements_specifications
        WHERE unique_id = @0
      `,
      [input.specificationSlug],
    )) as Array<Record<string, unknown>>
    const id = firstNumber(rows, 'id')
    if (id != null) return id
    throw notFoundError('Specification not found.', {
      specificationSlug: input.specificationSlug,
    })
  }

  async resolveSpecificationIdForLocalRequirement(
    localRequirementId?: number,
    specificationSlug?: string,
  ): Promise<number> {
    if (specificationSlug) {
      return this.resolveSpecificationId({ specificationSlug })
    }
    if (!localRequirementId) {
      throw validationError('Missing local requirement reference', {
        reason: 'missing_local_requirement_reference',
      })
    }
    const db = await this.getDb()
    const rows = (await db.query(
      `
        SELECT TOP (1) specification_id AS specificationId
        FROM specification_local_requirements
        WHERE id = @0
      `,
      [localRequirementId],
    )) as Array<Record<string, unknown>>
    const specificationId = firstNumber(rows, 'specificationId')
    if (specificationId != null) return specificationId
    throw notFoundError('Specification-local requirement not found', {
      localRequirementId,
    })
  }

  async resolveRequirementTarget(
    input: RequirementReference,
  ): Promise<RequirementTarget> {
    if (input.id == null && !input.uniqueId) {
      throw validationError('Missing requirement reference', {
        reason: 'missing_requirement_reference',
      })
    }
    const db = await this.getDb()
    const whereClause =
      input.id != null ? 'requirement.id = @0' : 'requirement.unique_id = @0'
    const parameter = input.id ?? input.uniqueId
    const rows = (await db.query(
      `
        SELECT TOP (1)
          requirement.id AS id,
          requirement.unique_id AS uniqueId,
          requirement.requirement_area_id AS areaId,
          latest.requirement_status_id AS latestStatusId,
          CASE WHEN EXISTS (
            SELECT 1
            FROM requirement_versions published_version
            WHERE published_version.requirement_id = requirement.id
              AND published_version.requirement_status_id = @1
          ) THEN 1 ELSE 0 END AS hasPublishedVersion
        FROM requirements requirement
        OUTER APPLY (
          SELECT TOP (1) requirement_status_id
          FROM requirement_versions latest_version
          WHERE latest_version.requirement_id = requirement.id
          ORDER BY latest_version.version_number DESC
        ) latest
        WHERE ${whereClause}
      `,
      [parameter, STATUS_PUBLISHED],
    )) as Array<Record<string, unknown>>
    const row = rows[0]
    if (!row) {
      throw notFoundError('Requirement not found', {
        id: input.id,
        uniqueId: input.uniqueId,
      })
    }
    return {
      areaId: Number(row.areaId),
      hasPublishedVersion: numericFlag(row.hasPublishedVersion),
      id: Number(row.id),
      latestStatusId:
        row.latestStatusId == null ? null : Number(row.latestStatusId),
      uniqueId: String(row.uniqueId),
    }
  }

  async resolveDeviationTarget(
    action: Extract<RequirementsAction, { kind: 'manage_deviation' }>,
  ): Promise<DeviationTarget> {
    const db = await this.getDb()
    if (action.deviationId != null) {
      const libraryRows = (await db.query(
        `
          SELECT TOP (1)
            item.requirements_specification_id AS specificationId,
            deviation.created_by_hsa_id AS createdByHsaId
          FROM deviations deviation
          INNER JOIN requirements_specification_items item
            ON item.id = deviation.specification_item_id
          WHERE deviation.id = @0
        `,
        [action.deviationId],
      )) as Array<Record<string, unknown>>
      const localRows = (await db.query(
        `
          SELECT TOP (1)
            local_requirement.specification_id AS specificationId,
            local_deviation.created_by_hsa_id AS createdByHsaId
          FROM specification_local_requirement_deviations local_deviation
          INNER JOIN specification_local_requirements local_requirement
            ON local_requirement.id =
              local_deviation.specification_local_requirement_id
          WHERE local_deviation.id = @0
        `,
        [action.deviationId],
      )) as Array<Record<string, unknown>>

      const librarySpecificationId = firstNumber(libraryRows, 'specificationId')
      const localSpecificationId = firstNumber(localRows, 'specificationId')

      if (librarySpecificationId != null && localSpecificationId != null) {
        throw validationError('Ambiguous deviation target', {
          deviationId: action.deviationId,
          reason: 'ambiguous_deviation_id',
        })
      }

      if (librarySpecificationId != null) {
        return {
          createdByHsaId: firstString(libraryRows, 'createdByHsaId'),
          specificationId: librarySpecificationId,
        }
      }

      if (localSpecificationId != null) {
        return {
          createdByHsaId: firstString(localRows, 'createdByHsaId'),
          specificationId: localSpecificationId,
        }
      }
      throw notFoundError('Deviation not found', {
        deviationId: action.deviationId,
      })
    }

    if (action.specificationItemId == null) {
      throw validationError('Missing deviation target', {
        reason: 'missing_deviation_target',
      })
    }
    const rows = (await db.query(
      `
        SELECT TOP (1) requirements_specification_id AS specificationId
        FROM requirements_specification_items
        WHERE id = @0
      `,
      [action.specificationItemId],
    )) as Array<Record<string, unknown>>
    const specificationId = firstNumber(rows, 'specificationId')
    if (specificationId != null) {
      return { createdByHsaId: null, specificationId }
    }
    throw notFoundError('Specification item not found', {
      specificationItemId: action.specificationItemId,
    })
  }

  async resolveSuggestionRequirementArea(
    action:
      | Extract<RequirementsAction, { kind: 'list_suggestions' }>
      | Extract<RequirementsAction, { kind: 'manage_suggestion' }>,
  ): Promise<number> {
    const db = await this.getDb()
    if ('suggestionId' in action && action.suggestionId != null) {
      const rows = (await db.query(
        `
          SELECT TOP (1) requirement.requirement_area_id AS areaId
          FROM improvement_suggestions suggestion
          INNER JOIN requirements requirement
            ON requirement.id = suggestion.requirement_id
          WHERE suggestion.id = @0
        `,
        [action.suggestionId],
      )) as Array<Record<string, unknown>>
      const areaId = firstNumber(rows, 'areaId')
      if (areaId != null) return areaId
      throw notFoundError('Improvement suggestion not found', {
        suggestionId: action.suggestionId,
      })
    }
    const requirement = await this.resolveRequirementTarget({
      id: action.requirementId,
      uniqueId: 'uniqueId' in action ? action.uniqueId : undefined,
    })
    return requirement.areaId
  }

  async resolveRfiQuestionArea(
    action: Extract<RequirementsAction, { kind: 'manage_rfi_question' }>,
  ): Promise<number> {
    if (action.areaId != null) return action.areaId
    if (action.questionId == null) {
      throw validationError('Missing RFI question target', {
        reason: 'missing_rfi_question_target',
      })
    }
    const db = await this.getDb()
    const rows = (await db.query(
      `
        SELECT TOP (1) area_id AS areaId
        FROM rfi_questions
        WHERE id = @0
      `,
      [action.questionId],
    )) as Array<Record<string, unknown>>
    const areaId = firstNumber(rows, 'areaId')
    if (areaId != null) return areaId
    throw notFoundError('RFI question not found', {
      questionId: action.questionId,
    })
  }

  async resolveRfiQuestionSuggestionArea(
    action: Extract<
      RequirementsAction,
      { kind: 'manage_rfi_question_suggestion' }
    >,
  ): Promise<number> {
    if (action.areaId != null) return action.areaId
    if (action.suggestionId == null) {
      throw validationError('Missing RFI question suggestion target', {
        reason: 'missing_rfi_question_suggestion_target',
      })
    }
    const db = await this.getDb()
    const rows = (await db.query(
      `
        SELECT TOP (1) area_id AS areaId
        FROM rfi_question_suggestions
        WHERE id = @0
      `,
      [action.suggestionId],
    )) as Array<Record<string, unknown>>
    const areaId = firstNumber(rows, 'areaId')
    if (areaId != null) return areaId
    throw notFoundError('RFI question suggestion not found', {
      suggestionId: action.suggestionId,
    })
  }
}

export class AssignmentBasedAuthorizationService
  implements AuthorizationService
{
  private readonly lookup: AssignmentLookup

  constructor(
    lookupOrDb?: AssignmentLookup | SqlServerDatabase | DatabaseProvider,
  ) {
    this.lookup = isAssignmentLookup(lookupOrDb)
      ? lookupOrDb
      : new SqlAssignmentLookup(lookupOrDb)
  }

  async assertAuthorized(
    action: RequirementsAction,
    context: RequestContext,
  ): Promise<void> {
    requireAuthenticated(context)

    if (hasRole(context, 'Admin') && !this.isReviewerOnlyAction(action)) {
      return
    }

    switch (action.kind) {
      case 'query_catalog':
      case 'get_import_schema':
      case 'get_import_instruction':
      case 'manage_import':
      case 'manage_norm_reference':
        return
      case 'list_specifications':
        return this.assertCanListSpecifications(context)
      case 'get_specification_items':
      case 'list_deviations': {
        const specificationId = await this.lookup.resolveSpecificationId(action)
        return this.assertCanReadSpecification(context, specificationId)
      }
      case 'add_to_specification':
      case 'remove_from_specification': {
        const specificationId = await this.lookup.resolveSpecificationId(action)
        return this.assertSpecificationAuthor(context, specificationId)
      }
      case 'list_graduation_target_areas': {
        const specificationId = await this.lookup.resolveSpecificationId(action)
        return this.assertSpecificationAuthor(context, specificationId)
      }
      case 'graduate_specification_local_requirement': {
        const specificationId = await this.lookup.resolveSpecificationId(action)
        await this.assertSpecificationAuthor(context, specificationId)
        return this.assertAreaAuthor(context, action.requirementAreaId)
      }
      case 'manage_specification_local_requirement': {
        const specificationId =
          action.specificationId ??
          (await this.lookup.resolveSpecificationIdForLocalRequirement(
            action.localRequirementId,
            action.specificationSlug,
          ))
        return this.assertSpecificationAuthor(context, specificationId)
      }
      case 'manage_specification_needs_reference': {
        const specificationId = await this.lookup.resolveSpecificationId(action)
        return this.assertSpecificationAuthor(context, specificationId)
      }
      case 'get_requirement':
        return this.assertCanReadRequirement(context, action)
      case 'manage_requirement':
        return this.assertCanManageRequirement(context, action)
      case 'transition_requirement':
        return this.assertCanTransitionRequirement(context, action)
      case 'manage_deviation':
        return this.assertCanManageDeviation(context, action)
      case 'list_suggestions':
        return this.assertCanListSuggestions(context, action)
      case 'manage_suggestion':
        return this.assertCanManageSuggestion(context, action)
      case 'manage_rfi_question':
        return this.assertCanManageRfiQuestion(context, action)
      case 'manage_specification_rfi': {
        const specificationId = await this.lookup.resolveSpecificationId(action)
        return this.assertSpecificationAuthor(context, specificationId)
      }
      case 'manage_rfi_question_suggestion':
        return this.assertCanManageRfiQuestionSuggestion(context, action)
      case 'generate_requirements':
        return this.assertCanUseAiProvider(context, action)
    }
  }

  private isReviewerOnlyAction(action: RequirementsAction): boolean {
    if (action.kind === 'manage_deviation') {
      return action.operation === 'record_decision'
    }
    if (action.kind === 'manage_requirement') {
      return (
        action.operation === 'approve_archiving' ||
        action.operation === 'cancel_archiving'
      )
    }
    if (action.kind === 'transition_requirement') {
      return true
    }
    return false
  }

  private assertReviewer(context: RequestContext): void {
    if (hasRole(context, 'Reviewer')) return
    throw forbiddenError('Reviewer role is required for this decision', {
      actorRoles: context.actor.roles,
      reason: 'reviewer_required',
      requiredRoles: ['Reviewer'],
    })
  }

  private async assertCanListSpecifications(
    context: RequestContext,
  ): Promise<void> {
    if (hasRole(context, 'Reviewer')) return
    if (hasRole(context, 'Admin')) return
    requireActorHsaId(context, 'missing_actor_hsa_id')
  }

  private async assertCanReadSpecification(
    context: RequestContext,
    specificationId: number,
  ): Promise<void> {
    if (hasRole(context, 'Reviewer')) return
    await this.assertSpecificationAuthor(context, specificationId)
  }

  private async assertSpecificationAuthor(
    context: RequestContext,
    specificationId: number,
  ): Promise<void> {
    const hsaId = requireActorHsaId(context, 'missing_actor_hsa_id')
    if (await this.lookup.isSpecificationAuthor(specificationId, hsaId)) return
    throw forbiddenError('Specification author assignment is required', {
      reason: 'specification_author_required',
      specificationId,
    })
  }

  private async assertAreaAuthor(
    context: RequestContext,
    areaId: number,
  ): Promise<void> {
    const hsaId = requireActorHsaId(context, 'missing_actor_hsa_id')
    if (await this.lookup.isRequirementAreaAuthor(areaId, hsaId)) return
    throw forbiddenError('Requirement area author assignment is required', {
      reason: 'requirement_area_author_required',
      requirementAreaId: areaId,
    })
  }

  private async assertCanReadRequirement(
    context: RequestContext,
    action: Extract<RequirementsAction, { kind: 'get_requirement' }>,
  ): Promise<void> {
    const target = await this.lookup.resolveRequirementTarget(action)
    if (target.hasPublishedVersion && action.view !== 'history') return
    if (hasRole(context, 'Reviewer')) return
    await this.assertAreaAuthor(context, target.areaId)
  }

  private async assertCanManageRequirement(
    context: RequestContext,
    action: Extract<RequirementsAction, { kind: 'manage_requirement' }>,
  ): Promise<void> {
    if (this.isReviewerOnlyAction(action)) {
      this.assertReviewer(context)
      return
    }

    if (action.operation === 'create') {
      if (!action.areaId) {
        throw validationError('Create operation requires requirement.areaId', {
          reason: 'missing_requirement_area_id',
        })
      }
      await this.assertAreaAuthor(context, action.areaId)
      return
    }

    const target = await this.lookup.resolveRequirementTarget(action)
    await this.assertAreaAuthor(context, target.areaId)
    if (action.areaId != null && action.areaId !== target.areaId) {
      await this.assertAreaAuthor(context, action.areaId)
    }
  }

  private async assertCanTransitionRequirement(
    context: RequestContext,
    action: Extract<RequirementsAction, { kind: 'transition_requirement' }>,
  ): Promise<void> {
    const target = await this.lookup.resolveRequirementTarget(action)
    if (
      action.toStatusId === STATUS_PUBLISHED ||
      action.toStatusId === STATUS_ARCHIVED ||
      (target.latestStatusId === STATUS_REVIEW &&
        action.toStatusId !== STATUS_REVIEW)
    ) {
      this.assertReviewer(context)
      return
    }
    if (hasRole(context, 'Admin')) return
    await this.assertAreaAuthor(context, target.areaId)
  }

  private async assertCanManageDeviation(
    context: RequestContext,
    action: Extract<RequirementsAction, { kind: 'manage_deviation' }>,
  ): Promise<void> {
    const target = await this.lookup.resolveDeviationTarget(action)
    if (action.operation === 'record_decision') {
      this.assertReviewer(context)
      return
    }
    await this.assertSpecificationAuthor(context, target.specificationId)
  }

  private async assertCanListSuggestions(
    context: RequestContext,
    action: Extract<RequirementsAction, { kind: 'list_suggestions' }>,
  ): Promise<void> {
    const requirement = await this.lookup.resolveRequirementTarget(action)
    if (requirement.hasPublishedVersion) return
    if (hasRole(context, 'Reviewer')) return
    await this.assertAreaAuthor(context, requirement.areaId)
  }

  private async assertCanManageSuggestion(
    context: RequestContext,
    action: Extract<RequirementsAction, { kind: 'manage_suggestion' }>,
  ): Promise<void> {
    const areaId = await this.lookup.resolveSuggestionRequirementArea(action)
    await this.assertAreaAuthor(context, areaId)
  }

  private async assertCanManageRfiQuestion(
    context: RequestContext,
    action: Extract<RequirementsAction, { kind: 'manage_rfi_question' }>,
  ): Promise<void> {
    const areaId = await this.lookup.resolveRfiQuestionArea(action)
    await this.assertAreaAuthor(context, areaId)
  }

  private async assertCanManageRfiQuestionSuggestion(
    context: RequestContext,
    action: Extract<
      RequirementsAction,
      { kind: 'manage_rfi_question_suggestion' }
    >,
  ): Promise<void> {
    if (action.operation === 'create') {
      if (action.specificationId != null || action.specificationSlug) {
        const specificationId = await this.lookup.resolveSpecificationId(action)
        await this.assertSpecificationAuthor(context, specificationId)
      }
      if (action.areaId != null) {
        await this.assertAreaAuthor(context, action.areaId)
        return
      }
    }
    const areaId = await this.lookup.resolveRfiQuestionSuggestionArea(action)
    await this.assertAreaAuthor(context, areaId)
  }

  private async assertCanUseAiProvider(
    context: RequestContext,
    action: Extract<RequirementsAction, { kind: 'generate_requirements' }>,
  ): Promise<void> {
    if (hasRole(context, 'Admin')) return
    if (action.scopeType === 'requirement_area') {
      if (!action.scopeId) {
        throw validationError('AI generation requires a requirement area scope')
      }
      await this.assertAreaAuthor(context, action.scopeId)
      return
    }
    if (action.scopeType === 'specification') {
      if (!action.scopeId) {
        throw validationError('AI generation requires a specification scope')
      }
      await this.assertSpecificationAuthor(context, action.scopeId)
      return
    }
    throw forbiddenError('AI generation requires one authorized scope', {
      reason: 'ai_scope_required',
    })
  }
}
