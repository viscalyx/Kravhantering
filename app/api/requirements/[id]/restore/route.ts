import { type NextRequest, NextResponse } from 'next/server'
import { getRequestSqlServerDataSource } from '@/lib/db'
import { createRequestContext } from '@/lib/requirements/auth'
import {
  createRequirementsService,
  toHttpErrorPayload,
} from '@/lib/requirements/service'
import { isPositiveInteger, readJsonObject } from '../../json-body'
import { parseRequirementRef } from '../../parse-requirement-ref'

type Params = Promise<{ id: string }>

export async function POST(
  request: NextRequest,
  { params }: { params: Params },
) {
  const { id } = await params
  const parsed = await readJsonObject(request)
  if (parsed.response) return parsed.response
  const { body } = parsed
  if (!isPositiveInteger(body.versionNumber)) {
    return NextResponse.json(
      { error: 'Missing or invalid versionNumber' },
      { status: 400 },
    )
  }
  const db = await getRequestSqlServerDataSource()
  const service = createRequirementsService(db)

  try {
    const context = await createRequestContext(request, 'rest')
    const ref = parseRequirementRef(id)
    const result = await service.manageRequirement(context, {
      ...ref,
      operation: 'restore_version',
      versionNumber: body.versionNumber,
    })
    return NextResponse.json({ ok: true, version: result.result })
  } catch (error) {
    const { body: errorBody, status } = toHttpErrorPayload(error)
    return NextResponse.json(errorBody, { status })
  }
}
