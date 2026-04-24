import { type NextRequest, NextResponse } from 'next/server'
import { getOwnerById } from '@/lib/dal/owners'
import { getRequestSqlServerDataSource } from '@/lib/db'
import { createRequestContext } from '@/lib/requirements/auth'
import {
  createRequirementsService,
  toHttpErrorPayload,
} from '@/lib/requirements/service'
import type { RequirementDetailResponse } from '@/lib/requirements/types'

type Params = Promise<{ id: string }>

import { parseRequirementRef } from '../parse-requirement-ref'

export async function GET(
  _request: NextRequest,
  { params }: { params: Params },
) {
  const { id } = await params
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
  const { id } = await params
  const db = await getRequestSqlServerDataSource()
  const service = createRequirementsService(db)
  const body = (await request.json()) as Record<string, unknown>

  try {
    const context = await createRequestContext(request, 'rest')
    const ref = parseRequirementRef(id)
    const result = await service.manageRequirement(context, {
      ...ref,
      operation: 'edit',
      requirement: {
        acceptanceCriteria: body.acceptanceCriteria
          ? String(body.acceptanceCriteria)
          : undefined,
        areaId: body.areaId ? Number(body.areaId) : undefined,
        categoryId: body.categoryId ? Number(body.categoryId) : undefined,
        createdBy: body.ownerId ? String(body.ownerId) : undefined,
        description: String(body.description ?? ''),
        expectedEditedAt:
          body.expectedEditedAt === null
            ? null
            : body.expectedEditedAt != null
              ? String(body.expectedEditedAt)
              : undefined,
        normReferenceIds: Array.isArray(body.normReferenceIds)
          ? body.normReferenceIds
              .map(value => Number(value))
              .filter(value => !Number.isNaN(value))
          : undefined,
        requiresTesting: (body.requiresTesting as boolean) ?? false,
        verificationMethod: body.verificationMethod
          ? String(body.verificationMethod)
          : undefined,
        scenarioIds: Array.isArray(body.scenarioIds)
          ? body.scenarioIds
              .map(value => Number(value))
              .filter(value => !Number.isNaN(value))
          : undefined,
        qualityCharacteristicId: body.qualityCharacteristicId
          ? Number(body.qualityCharacteristicId)
          : undefined,
        riskLevelId: body.riskLevelId ? Number(body.riskLevelId) : undefined,
        typeId: body.typeId ? Number(body.typeId) : undefined,
      },
    })
    return NextResponse.json({
      id: result.detail?.id ?? ref.id ?? Number(id),
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
  const { id } = await params
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
