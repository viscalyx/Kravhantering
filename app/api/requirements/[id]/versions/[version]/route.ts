import { getCloudflareContext } from '@opennextjs/cloudflare'
import { type NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { createRequestContext } from '@/lib/requirements/auth'
import {
  createRequirementsService,
  toHttpErrorPayload,
} from '@/lib/requirements/service'

type Params = Promise<{ id: string; version: string }>

export async function GET(
  _request: NextRequest,
  { params }: { params: Params },
) {
  const { id, version } = await params
  const { env } = await getCloudflareContext({ async: true })
  const db = getDb(env.DB)
  const service = createRequirementsService(db)
  const context = createRequestContext(_request, 'rest')

  try {
    const result = await service.getRequirement(context, {
      id: Number(id),
      versionNumber: Number(version),
      view: 'version',
    })

    return NextResponse.json({
      uniqueId: result.requirement.uniqueId,
      version: result.version,
    })
  } catch (error) {
    const { body, status } = toHttpErrorPayload(error)
    return NextResponse.json(body, { status })
  }
}
