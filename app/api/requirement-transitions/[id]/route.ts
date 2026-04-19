import { type NextRequest, NextResponse } from 'next/server'
import { getRequestDatabase } from '@/lib/db'
import { createRequestContext } from '@/lib/requirements/auth'
import {
  createRequirementsService,
  toHttpErrorPayload,
} from '@/lib/requirements/service'
import { parseRequirementRef } from '../../requirements/parse-requirement-ref'

type Params = Promise<{ id: string }>

export async function POST(
  request: NextRequest,
  { params }: { params: Params },
) {
  const { id } = await params
  const db = await getRequestDatabase()
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
    const ref = parseRequirementRef(id)
    const result = await service.transitionRequirement(context, {
      ...ref,
      responseFormat: 'json',
      toStatusId: statusId,
    })
    return NextResponse.json({
      id: result.detail.id,
      uniqueId: result.detail.uniqueId,
      version: result.version,
    })
  } catch (error) {
    const { body: errorBody, status } = toHttpErrorPayload(error)
    return NextResponse.json(errorBody, { status })
  }
}
