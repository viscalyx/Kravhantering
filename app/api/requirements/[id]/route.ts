import { getCloudflareContext } from '@opennextjs/cloudflare'
import { type NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { createRequestContext } from '@/lib/requirements/auth'
import {
  createRequirementsService,
  toHttpErrorPayload,
} from '@/lib/requirements/service'

type Params = Promise<{ id: string }>

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
    const result = await service.getRequirement(context, {
      id: Number(id),
      view: 'history',
    })
    return NextResponse.json(result.requirement)
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
    const result = await service.manageRequirement(context, {
      id: Number(id),
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
        scenarioIds: Array.isArray(body.scenarioIds)
          ? body.scenarioIds
              .map(value => Number(value))
              .filter(value => !Number.isNaN(value))
          : undefined,
        typeCategoryId: body.typeCategoryId
          ? Number(body.typeCategoryId)
          : undefined,
        typeId: body.typeId ? Number(body.typeId) : undefined,
      },
    })
    return NextResponse.json({ id: Number(id), version: result.result })
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
    await service.manageRequirement(context, {
      id: Number(id),
      operation: 'archive',
    })
    return NextResponse.json({ ok: true })
  } catch (error) {
    const { body, status } = toHttpErrorPayload(error)
    return NextResponse.json(body, { status })
  }
}
