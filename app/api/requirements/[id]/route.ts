import { getCloudflareContext } from '@opennextjs/cloudflare'
import { type NextRequest, NextResponse } from 'next/server'
import { getOwnerById } from '@/lib/dal/owners'
import { getDb } from '@/lib/db'
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
  const { env } = await getCloudflareContext({ async: true })
  const db = getDb(env.DB)
  const service = createRequirementsService(db)
  const context = createRequestContext(_request, 'rest')

  try {
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
  const { env } = await getCloudflareContext({ async: true })
  const db = getDb(env.DB)
  const service = createRequirementsService(db)
  const context = createRequestContext(request, 'rest')
  const body = (await request.json()) as Record<string, unknown>

  try {
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
        references: Array.isArray(body.references)
          ? body.references
              .filter(
                (
                  reference,
                ): reference is {
                  id?: number
                  name?: string
                  owner?: string
                  uri?: string
                } =>
                  typeof reference === 'object' &&
                  reference !== null &&
                  typeof reference.name === 'string',
              )
              .map(reference => ({
                id: reference.id,
                name: reference.name ?? '',
                owner: reference.owner,
                uri: reference.uri,
              }))
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
  const { env } = await getCloudflareContext({ async: true })
  const db = getDb(env.DB)
  const service = createRequirementsService(db)
  const context = createRequestContext(_request, 'rest')

  try {
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
