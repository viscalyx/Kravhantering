import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  deleteSpecificationLocalRequirement,
  getSpecificationById,
  getSpecificationBySlug,
  getSpecificationLocalRequirementDetail,
  updateSpecificationLocalRequirement,
} from '@/lib/dal/requirements-specifications'
import type { SqlServerDatabase } from '@/lib/db'
import { getRequestSqlServerDataSource } from '@/lib/db'
import { logSanitizedError } from '@/lib/http/safe-errors'
import {
  customMutationPolicy,
  secureMutationRoute,
} from '@/lib/http/secure-mutation-route'
import { specificationLocalRequirementSchema } from '@/lib/http/specification-local-requirement-validation'
import {
  parseRouteParams,
  positiveIntegerStringSchema,
  specificationIdOrSlugSchema,
} from '@/lib/http/validation'
import { isRequirementsServiceError } from '@/lib/requirements/errors'
import { toHttpErrorPayload } from '@/lib/requirements/http-errors'

export const dynamic = 'force-dynamic'

type Params = Promise<{ id: string; localRequirementId: string }>

const specificationLocalRequirementParamSchema = z
  .object({
    id: specificationIdOrSlugSchema,
    localRequirementId: positiveIntegerStringSchema,
  })
  .strict()

async function resolveSpecificationId(
  db: SqlServerDatabase,
  idOrSlug: string,
): Promise<number | null> {
  if (/^\d+$/.test(idOrSlug)) {
    return (await getSpecificationById(db, Number(idOrSlug)))?.id ?? null
  }

  return (await getSpecificationBySlug(db, idOrSlug))?.id ?? null
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
  const specificationId = await resolveSpecificationId(db, id)
  if (specificationId === null) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const requirement = await getSpecificationLocalRequirementDetail(
    db,
    specificationId,
    numericLocalRequirementId,
  )
  if (!requirement) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json(requirement)
}

export const PUT = secureMutationRoute({
  bodySchema: specificationLocalRequirementSchema,
  paramsSchema: specificationLocalRequirementParamSchema,
  policy: customMutationPolicy(
    'specification_local_requirement.update',
    () => {},
  ),
  handler: async ({ body, params }) => {
    const { id, localRequirementId: numericLocalRequirementId } = params
    const db = await getRequestSqlServerDataSource()
    const specificationId = await resolveSpecificationId(db, id)
    if (specificationId === null) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    try {
      const localRequirement = await updateSpecificationLocalRequirement(
        db,
        specificationId,
        numericLocalRequirementId,
        {
          acceptanceCriteria: body.acceptanceCriteria ?? null,
          description: body.description,
          needsReferenceId: body.needsReferenceId ?? null,
          normReferenceIds: body.normReferenceIds,
          qualityCharacteristicId: body.qualityCharacteristicId ?? null,
          requirementAreaId: body.requirementAreaId ?? null,
          requirementCategoryId: body.requirementCategoryId ?? null,
          requirementPackageIds: body.requirementPackageIds,
          requirementTypeId: body.requirementTypeId ?? null,
          requiresTesting: body.requiresTesting,
          riskLevelId: body.riskLevelId ?? null,
          verificationMethod: body.verificationMethod ?? null,
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

export const DELETE = secureMutationRoute({
  paramsSchema: specificationLocalRequirementParamSchema,
  policy: customMutationPolicy(
    'specification_local_requirement.delete',
    () => {},
  ),
  handler: async ({ params }) => {
    const { id, localRequirementId: numericLocalRequirementId } = params
    const db = await getRequestSqlServerDataSource()
    const specificationId = await resolveSpecificationId(db, id)
    if (specificationId === null) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    try {
      const deleted = await deleteSpecificationLocalRequirement(
        db,
        specificationId,
        numericLocalRequirementId,
      )
      if (!deleted) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 })
      }
    } catch (error) {
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
