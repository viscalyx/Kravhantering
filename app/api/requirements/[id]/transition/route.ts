import { getCloudflareContext } from '@opennextjs/cloudflare'
import { type NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { createRequestContext } from '@/lib/requirements/auth'
import {
  createRequirementsService,
  toHttpErrorPayload,
} from '@/lib/requirements/service'

type Params = Promise<{ id: string }>

export async function POST(
  request: NextRequest,
  { params }: { params: Params },
) {
  const { id } = await params
  const { env } = await getCloudflareContext({ async: true })
  const db = getDb(env.DB)
  const service = createRequirementsService(db)
  const context = createRequestContext(request, 'rest')
  const body = (await request.json()) as Record<string, unknown>

  const statusId = Number(body.statusId)
  if (Number.isNaN(statusId)) {
    return NextResponse.json(
      { error: 'Missing or invalid statusId' },
      { status: 400 },
    )
  }

  try {
    const result = await service.transitionRequirement(context, {
      id: Number(id),
      responseFormat: 'json',
      toStatusId: statusId,
    })
    return NextResponse.json({ id: Number(id), version: result.version })
  } catch (error) {
    const { body: errorBody, status } = toHttpErrorPayload(error)
    return NextResponse.json(errorBody, { status })
  }
}
