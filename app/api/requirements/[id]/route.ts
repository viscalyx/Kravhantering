import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getOwnerById } from '@/lib/dal/owners'
import { getRequestSqlServerDataSource } from '@/lib/db'
import {
  businessTextSchema,
  optionalBusinessTextSchema,
  parseRouteParams,
  positiveIntegerSchema,
  readJsonWithSchema,
  refOrPositiveIntegerSegmentSchema,
  uniquePositiveIntegerArraySchema,
} from '@/lib/http/validation'
import { createRequestContext } from '@/lib/requirements/auth'
import {
  createRequirementsService,
  toHttpErrorPayload,
} from '@/lib/requirements/service'
import type { RequirementDetailResponse } from '@/lib/requirements/types'
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
    baseRevisionToken: z.string().uuid(),
    baseVersionId: positiveIntegerSchema,
    categoryId: optionalBodyIdSchema,
    description: businessTextSchema,
    normReferenceIds: optionalBodyIdArraySchema,
    ownerId: optionalBusinessTextSchema,
    qualityCharacteristicId: optionalBodyIdSchema,
    requirementPackageIds: optionalBodyIdArraySchema,
    requiresTesting: z.boolean().optional().default(false),
    riskLevelId: optionalBodyIdSchema,
    typeId: optionalBodyIdSchema,
    verificationMethod: optionalBusinessTextSchema,
  })
  .strict()

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
  const db = await getRequestSqlServerDataSource()
  const service = createRequirementsService(db)

  try {
    const context = await createRequestContext(_request, 'rest')
    const ref = parseRequirementRef(id)
    const result = await service.getRequirement(context, {
      ...ref,
      view: 'history',
    })
    const req = result.requirement
    let areaOwnerName: string | null = null
    if (req.area?.ownerId) {
      const owner = await getOwnerById(db, req.area.ownerId)
      if (owner) areaOwnerName = `${owner.firstName} ${owner.lastName}`
    }
    const responseBody: RequirementDetailResponse = {
      ...req,
      area: req.area ? { ...req.area, ownerName: areaOwnerName } : null,
    }
    return NextResponse.json(responseBody)
  } catch (error) {
    const { body, status } = toHttpErrorPayload(error)
    return NextResponse.json(body, { status })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Params },
) {
  const parsedParams = await parseRouteParams(
    params,
    requirementRefParamsSchema,
  )
  if (!parsedParams.ok) return parsedParams.response
  const { id } = parsedParams.data
  const parsedBody = await readJsonWithSchema(request, requirementEditSchema)
  if (!parsedBody.ok) return parsedBody.response
  const body = parsedBody.data
  const db = await getRequestSqlServerDataSource()
  const service = createRequirementsService(db)

  try {
    const context = await createRequestContext(request, 'rest')
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
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Params },
) {
  const parsedParams = await parseRouteParams(
    params,
    requirementRefParamsSchema,
  )
  if (!parsedParams.ok) return parsedParams.response
  const { id } = parsedParams.data
  const db = await getRequestSqlServerDataSource()
  const service = createRequirementsService(db)

  try {
    const context = await createRequestContext(_request, 'rest')
    const ref = parseRequirementRef(id)
    await service.manageRequirement(context, {
      ...ref,
      operation: 'archive',
    })
    return NextResponse.json({ ok: true })
  } catch (error) {
    const { body, status } = toHttpErrorPayload(error)
    return NextResponse.json(body, { status })
  }
}
