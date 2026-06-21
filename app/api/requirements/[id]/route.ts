import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getTransitionsFrom } from '@/lib/dal/requirement-statuses'
import {
  requirementsMutationPolicy,
  secureMutationRoute,
} from '@/lib/http/secure-mutation-route'
import {
  businessTextSchema,
  optionalBusinessTextSchema,
  parseRouteParams,
  positiveIntegerSchema,
  refOrPositiveIntegerSegmentSchema,
  uniquePositiveIntegerArraySchema,
} from '@/lib/http/validation'
import type {
  AuthorizationService,
  RequestContext,
  RequirementsAction,
} from '@/lib/requirements/auth'
import { isRequirementsServiceError } from '@/lib/requirements/errors'
import { createRequirementsRestRuntime } from '@/lib/requirements/server'
import { toHttpErrorPayload } from '@/lib/requirements/service'
import {
  STATUS_ARCHIVED,
  STATUS_PUBLISHED,
} from '@/lib/requirements/status-constants.mjs'
import type {
  RequirementDetailPermissions,
  RequirementDetailResponse,
} from '@/lib/requirements/types'
import { parseRequirementRef } from '../parse-requirement-ref'

export const dynamic = 'force-dynamic'

type Params = Promise<{ id: string }>

const requirementRefParamsSchema = z
  .object({
    id: refOrPositiveIntegerSegmentSchema,
  })
  .strict()

const optionalBodyIdSchema = positiveIntegerSchema
  .nullable()
  .optional()
  .transform(value => value ?? undefined)

const optionalBodyIdArraySchema = uniquePositiveIntegerArraySchema()
  .nullable()
  .optional()
  .transform(value => value ?? undefined)

const requirementEditSchema = z
  .object({
    acceptanceCriteria: optionalBusinessTextSchema,
    areaId: optionalBodyIdSchema,
    baseRevisionToken: z.uuid(),
    baseVersionId: positiveIntegerSchema,
    categoryId: optionalBodyIdSchema,
    description: businessTextSchema,
    normReferenceIds: optionalBodyIdArraySchema,
    qualityCharacteristicId: optionalBodyIdSchema,
    requirementPackageIds: optionalBodyIdArraySchema,
    requiresTesting: z.boolean().optional().default(false),
    riskLevelId: optionalBodyIdSchema,
    typeId: optionalBodyIdSchema,
    verificationMethod: optionalBusinessTextSchema,
  })
  .strict()

function isAuthorizationDenied(error: unknown): boolean {
  if (isRequirementsServiceError(error)) {
    return error.code === 'forbidden' || error.code === 'unauthorized'
  }
  if (!(error instanceof Error)) return false
  const denial = error as {
    code?: unknown
    name?: unknown
    status?: unknown
  }
  return (
    denial.status === 401 ||
    denial.status === 403 ||
    denial.code === 'unauthorized' ||
    denial.code === 'forbidden' ||
    denial.name === 'AuthorizationError' ||
    denial.name === 'NotAuthorized'
  )
}

async function canAuthorize(
  authorization: AuthorizationService,
  action: RequirementsAction,
  context: RequestContext,
): Promise<boolean> {
  try {
    await authorization.assertAuthorized(action, context)
    return true
  } catch (error) {
    if (isAuthorizationDenied(error)) return false
    throw error
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Params },
) {
  const parsedParams = await parseRouteParams(
    params,
    requirementRefParamsSchema,
  )
  if (!parsedParams.ok) return parsedParams.response
  const { id } = parsedParams.data

  try {
    const { authorization, context, db, service } =
      await createRequirementsRestRuntime(_request)
    const ref = parseRequirementRef(id)
    const canViewHistory = await canAuthorize(
      authorization,
      {
        ...ref,
        kind: 'get_requirement',
        view: 'history',
      },
      context,
    )
    const result = await service.getRequirement(context, {
      ...ref,
      view: canViewHistory ? 'history' : 'detail',
    })
    const req = result.requirement
    const canonicalRef = { id: req.id, uniqueId: req.uniqueId }
    const latestStatusId = req.versions[0]?.status ?? null
    const transitionTargets =
      latestStatusId == null ? [] : await getTransitionsFrom(db, latestStatusId)
    const transitionCandidateIds = new Set(
      transitionTargets.map(transition => transition.id),
    )
    transitionCandidateIds.add(STATUS_ARCHIVED)
    transitionCandidateIds.add(STATUS_PUBLISHED)
    const allowedTransitionStatusIds: number[] = []
    for (const toStatusId of transitionCandidateIds) {
      if (
        await canAuthorize(
          authorization,
          {
            ...canonicalRef,
            kind: 'transition_requirement',
            toStatusId,
          },
          context,
        )
      ) {
        allowedTransitionStatusIds.push(toStatusId)
      }
    }
    const permissions: RequirementDetailPermissions = {
      allowedTransitionStatusIds,
      canArchive: await canAuthorize(
        authorization,
        {
          ...canonicalRef,
          kind: 'manage_requirement',
          operation: 'archive',
        },
        context,
      ),
      canDeleteDraft: await canAuthorize(
        authorization,
        {
          ...canonicalRef,
          kind: 'manage_requirement',
          operation: 'delete_draft',
        },
        context,
      ),
      canEdit: await canAuthorize(
        authorization,
        {
          ...canonicalRef,
          kind: 'manage_requirement',
          operation: 'edit',
        },
        context,
      ),
      canManageSuggestions: await canAuthorize(
        authorization,
        {
          kind: 'manage_suggestion',
          operation: 'create',
          requirementId: req.id,
        },
        context,
      ),
      canReactivate: await canAuthorize(
        authorization,
        {
          ...canonicalRef,
          kind: 'manage_requirement',
          operation: 'reactivate',
        },
        context,
      ),
      canRestore: await canAuthorize(
        authorization,
        {
          ...canonicalRef,
          kind: 'manage_requirement',
          operation: 'restore_version',
        },
        context,
      ),
      canViewHistory,
    }
    const responseBody: RequirementDetailResponse = {
      ...req,
      area: req.area ? { ...req.area, ownerName: req.area.ownerHsaId } : null,
      permissions,
    }
    return NextResponse.json(responseBody)
  } catch (error) {
    const { body, status } = toHttpErrorPayload(error)
    return NextResponse.json(body, { status })
  }
}

export const PUT = secureMutationRoute({
  bodySchema: requirementEditSchema,
  paramsSchema: requirementRefParamsSchema,
  policy: requirementsMutationPolicy<
    z.infer<typeof requirementEditSchema>,
    z.infer<typeof requirementRefParamsSchema>
  >(({ params }) => {
    const ref = parseRequirementRef(params.id)
    return { ...ref, kind: 'manage_requirement', operation: 'edit' }
  }),
  handler: async ({ body, context, params, request }) => {
    try {
      const { service } = await createRequirementsRestRuntime(request, {
        context,
      })
      const { id } = params
      const ref = parseRequirementRef(id)
      const result = await service.manageRequirement(context, {
        ...ref,
        operation: 'edit',
        requirement: {
          acceptanceCriteria: body.acceptanceCriteria,
          areaId: body.areaId,
          baseRevisionToken: body.baseRevisionToken,
          baseVersionId: body.baseVersionId,
          categoryId: body.categoryId,
          description: body.description,
          normReferenceIds: body.normReferenceIds,
          requiresTesting: body.requiresTesting,
          verificationMethod: body.verificationMethod,
          requirementPackageIds: body.requirementPackageIds,
          qualityCharacteristicId: body.qualityCharacteristicId,
          riskLevelId: body.riskLevelId,
          typeId: body.typeId,
        },
      })
      return NextResponse.json({
        id: result.detail?.id ?? ref.id ?? null,
        uniqueId: result.detail?.uniqueId,
        version: result.result,
      })
    } catch (error) {
      const { body: errorBody, status } = toHttpErrorPayload(error)
      return NextResponse.json(errorBody, { status })
    }
  },
})

export const DELETE = secureMutationRoute({
  paramsSchema: requirementRefParamsSchema,
  policy: requirementsMutationPolicy<
    unknown,
    z.infer<typeof requirementRefParamsSchema>
  >(({ params }) => {
    const ref = parseRequirementRef(params.id)
    return { ...ref, kind: 'manage_requirement', operation: 'archive' }
  }),
  handler: async ({ context, params, request }) => {
    try {
      const { service } = await createRequirementsRestRuntime(request, {
        context,
      })
      const { id } = params
      const ref = parseRequirementRef(id)
      const result = await service.manageRequirement(context, {
        ...ref,
        operation: 'archive',
      })
      const detail = result.detail ?? null
      return NextResponse.json({
        detail,
        id: detail?.id ?? ref.id ?? null,
        ok: true,
        uniqueId: detail?.uniqueId ?? ref.uniqueId ?? null,
      })
    } catch (error) {
      const { body, status } = toHttpErrorPayload(error)
      return NextResponse.json(body, { status })
    }
  },
})
