import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  deleteSpecificationLocalRequirement,
  getSpecificationById,
  getSpecificationLocalRequirementDetail,
  updateSpecificationLocalRequirement,
} from '@/lib/dal/requirements-specifications'
import { getRequestSqlServerDataSource } from '@/lib/db'
import { withRestResponsePolicy } from '@/lib/http/response-policy'
import { logSanitizedError } from '@/lib/http/safe-errors'
import {
  requirementsMutationPolicy,
  secureMutationRoute,
} from '@/lib/http/secure-mutation-route'
import { specificationLocalRequirementSchema } from '@/lib/http/specification-local-requirement-validation'
import {
  idParamSchema,
  parseRouteParams,
  positiveIntegerStringSchema,
  readJsonWithSchema,
} from '@/lib/http/validation'
import type { RequirementsAction } from '@/lib/requirements/auth'
import { isRequirementsServiceError } from '@/lib/requirements/errors'
import { toHttpErrorPayload } from '@/lib/requirements/http-errors'
import { createRequirementsRestRuntime } from '@/lib/requirements/server'
import { authorize } from '@/lib/requirements/service-shared'

export const dynamic = 'force-dynamic'

type Params = Promise<{ id: string; localRequirementId: string }>

const specificationLocalRequirementParamSchema = z
  .object({
    id: idParamSchema.shape.id,
    localRequirementId: positiveIntegerStringSchema,
  })
  .strict()

type SpecificationLocalRequirementParams = z.infer<
  typeof specificationLocalRequirementParamSchema
>
const localUpdateSchema = specificationLocalRequirementSchema.extend({
  authorizeDeviationEndings: z.boolean().optional(),
})
const localDeleteSchema = z
  .object({ authorizeDeviationEndings: z.boolean().optional() })
  .strict()
type SpecificationLocalRequirementBody = z.infer<typeof localUpdateSchema>

function specificationLocalRequirementAction(
  operation: string,
  params: SpecificationLocalRequirementParams,
): RequirementsAction {
  return {
    kind: 'manage_specification_local_requirement',
    localRequirementId: params.localRequirementId,
    operation,
    specificationId: params.id,
  }
}

async function getHandler(
  request: NextRequest,
  { params }: { params: Params },
) {
  const parsedParams = await parseRouteParams(
    params,
    specificationLocalRequirementParamSchema,
  )
  if (!parsedParams.ok) {
    return parsedParams.response
  }
  const { id, localRequirementId: numericLocalRequirementId } =
    parsedParams.data
  const runtime = await createRequirementsRestRuntime(request)
  try {
    await authorize(
      runtime.authorization,
      {
        childId: numericLocalRequirementId,
        childKind: 'specification_local_requirement',
        kind: 'get_specification_child',
        specificationId: id,
      },
      runtime.context,
    )
    const requirement = await getSpecificationLocalRequirementDetail(
      runtime.db,
      id,
      numericLocalRequirementId,
    )
    if (!requirement) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    return NextResponse.json(requirement)
  } catch (error) {
    if (!isRequirementsServiceError(error)) throw error
    const { body, status } = toHttpErrorPayload(error)
    return NextResponse.json(body, { status })
  }
}

export const GET = withRestResponsePolicy(getHandler)

export const PUT = secureMutationRoute<
  SpecificationLocalRequirementBody,
  SpecificationLocalRequirementParams
>({
  bodySchema: localUpdateSchema,
  paramsSchema: specificationLocalRequirementParamSchema,
  policy: requirementsMutationPolicy(({ params }) =>
    specificationLocalRequirementAction('update', params),
  ),
  handler: async ({ body, context, db: authorizationDb, params }) => {
    const { id, localRequirementId: numericLocalRequirementId } = params
    const db = authorizationDb ?? (await getRequestSqlServerDataSource())
    const specification = await getSpecificationById(db, id)
    if (!specification) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    try {
      const localRequirement = await updateSpecificationLocalRequirement(
        db,
        specification.id,
        numericLocalRequirementId,
        {
          acceptanceCriteria: body.acceptanceCriteria ?? null,
          description: body.description,
          needsReferenceId: body.needsReferenceId ?? null,
          normReferenceIds: body.normReferenceIds,
          qualityCharacteristicId: body.qualityCharacteristicId ?? null,
          requirementCategoryId: body.requirementCategoryId ?? null,
          requirementTypeId: body.requirementTypeId ?? null,
          verifiable: body.verifiable,
          priorityLevelId: body.priorityLevelId ?? null,
          verificationMethod: body.verificationMethod,
        },
        context.actor.hsaId,
        { authorizeDeviationEndings: body.authorizeDeviationEndings },
      )

      return NextResponse.json({ localRequirement, ok: true })
    } catch (error) {
      if (isRequirementsServiceError(error)) {
        const { body, status } = toHttpErrorPayload(error)
        return NextResponse.json(body, { status })
      }

      logSanitizedError(
        'Failed to update specification-local requirement',
        error,
      )
      return NextResponse.json(
        { error: 'Failed to update specification-local requirement' },
        { status: 500 },
      )
    }
  },
})

export const DELETE = secureMutationRoute<
  z.infer<typeof localDeleteSchema>,
  SpecificationLocalRequirementParams
>({
  bodyReader: ({ request }) =>
    request.body === null
      ? Promise.resolve({ ok: true as const, data: {} })
      : readJsonWithSchema(request, localDeleteSchema),
  paramsSchema: specificationLocalRequirementParamSchema,
  policy: requirementsMutationPolicy(({ params }) =>
    specificationLocalRequirementAction('delete', params),
  ),
  handler: async ({ body, context, db: authorizationDb, params }) => {
    const { id, localRequirementId: numericLocalRequirementId } = params
    const db = authorizationDb ?? (await getRequestSqlServerDataSource())
    const specification = await getSpecificationById(db, id)
    if (!specification) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    try {
      const deleted = await deleteSpecificationLocalRequirement(
        db,
        specification.id,
        numericLocalRequirementId,
        {
          actorHsaId: context.actor.hsaId,
          authorizeDeviationEndings: body.authorizeDeviationEndings,
        },
      )
      if (!deleted) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 })
      }
    } catch (error) {
      if (isRequirementsServiceError(error)) {
        const { body, status } = toHttpErrorPayload(error)
        return NextResponse.json(body, { status })
      }

      logSanitizedError(
        'Failed to delete specification-local requirement',
        error,
      )
      return NextResponse.json(
        { error: 'Failed to delete specification-local requirement' },
        { status: 500 },
      )
    }

    return NextResponse.json({ ok: true })
  },
})
