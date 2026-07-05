import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  deleteSpecificationLocalRequirement,
  getSpecificationById,
  getSpecificationLocalRequirementDetail,
  updateSpecificationLocalRequirement,
} from '@/lib/dal/requirements-specifications'
import { getRequestSqlServerDataSource } from '@/lib/db'
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
} from '@/lib/http/validation'
import type { RequirementsAction } from '@/lib/requirements/auth'
import { isRequirementsServiceError } from '@/lib/requirements/errors'
import { toHttpErrorPayload } from '@/lib/requirements/http-errors'

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
type SpecificationLocalRequirementBody = z.infer<
  typeof specificationLocalRequirementSchema
>

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

export async function GET(
  _request: NextRequest,
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
  const db = await getRequestSqlServerDataSource()
  const specification = await getSpecificationById(db, id)
  if (!specification) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const requirement = await getSpecificationLocalRequirementDetail(
    db,
    specification.id,
    numericLocalRequirementId,
  )
  if (!requirement) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json(requirement)
}

export const PUT = secureMutationRoute<
  SpecificationLocalRequirementBody,
  SpecificationLocalRequirementParams
>({
  bodySchema: specificationLocalRequirementSchema,
  paramsSchema: specificationLocalRequirementParamSchema,
  policy: requirementsMutationPolicy(({ params }) =>
    specificationLocalRequirementAction('update', params),
  ),
  handler: async ({ body, db: authorizationDb, params }) => {
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
  undefined,
  SpecificationLocalRequirementParams
>({
  paramsSchema: specificationLocalRequirementParamSchema,
  policy: requirementsMutationPolicy(({ params }) =>
    specificationLocalRequirementAction('delete', params),
  ),
  handler: async ({ db: authorizationDb, params }) => {
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
