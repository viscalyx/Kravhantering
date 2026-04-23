import { type NextRequest, NextResponse } from 'next/server'
import { getRequestSqlServerDataSource } from '@/lib/db'
import { createRequestContext } from '@/lib/requirements/auth'
import {
  createRequirementsService,
  toHttpErrorPayload,
} from '@/lib/requirements/service'
import { parseRequirementRef } from '../../parse-requirement-ref'

type Params = Promise<{ id: string }>

export async function POST(
  request: NextRequest,
  { params }: { params: Params },
) {
  const { id } = await params
  const body = (await request.json()) as { versionNumber: number }
  const db = await getRequestSqlServerDataSource()
  const service = createRequirementsService(db)
  const context = createRequestContext(request, 'rest')

  try {
    const ref = parseRequirementRef(id)
    const result = await service.manageRequirement(context, {
      ...ref,
      operation: 'restore_version',
      versionNumber: Number(body.versionNumber),
    })
    return NextResponse.json({ ok: true, version: result.result })
  } catch (error) {
    const { body: errorBody, status } = toHttpErrorPayload(error)
    return NextResponse.json(errorBody, { status })
  }
}
