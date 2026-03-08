import { getCloudflareContext } from '@opennextjs/cloudflare'
import { type NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { createRequestContext } from '@/lib/requirements/auth'
import {
  createRequirementsService,
  toHttpErrorPayload,
} from '@/lib/requirements/service'

export const runtime = 'edge'

type Params = Promise<{ id: string }>

export async function POST(
  request: NextRequest,
  { params }: { params: Params },
) {
  const { id } = await params
  const body = (await request.json()) as { versionNumber: number }
  const { env } = await getCloudflareContext()
  const db = getDb(env.DB)
  const service = createRequirementsService(db)
  const context = createRequestContext(request, 'rest')

  try {
    const result = await service.manageRequirement(context, {
      id: Number(id),
      operation: 'restore_version',
      versionNumber: Number(body.versionNumber),
    })
    return NextResponse.json({ ok: true, version: result.result })
  } catch (error) {
    const { body: errorBody, status } = toHttpErrorPayload(error)
    return NextResponse.json(errorBody, { status })
  }
}
