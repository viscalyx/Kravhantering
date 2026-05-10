import { type NextRequest, NextResponse } from 'next/server'
import { getRequestSqlServerDataSource } from '@/lib/db'
import { createRequestContext } from '@/lib/requirements/auth'
import {
  createRequirementsService,
  toHttpErrorPayload,
} from '@/lib/requirements/service'
import { isPositiveInteger, readJsonObject } from '../../requirements/json-body'
import { parseRequirementRef } from '../../requirements/parse-requirement-ref'

type Params = Promise<{ id: string }>

export async function POST(
  request: NextRequest,
  { params }: { params: Params },
) {
  const { id } = await params
  const parsed = await readJsonObject(request)
  if (parsed.response) return parsed.response
  const { body } = parsed

  if (!isPositiveInteger(body.statusId)) {
    return NextResponse.json(
      { error: 'Missing or invalid statusId' },
      { status: 400 },
    )
  }
  const db = await getRequestSqlServerDataSource()
  const service = createRequirementsService(db)

  try {
    const context = await createRequestContext(request, 'rest')
    const ref = parseRequirementRef(id)
    const result = await service.transitionRequirement(context, {
      ...ref,
      responseFormat: 'json',
      toStatusId: body.statusId,
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
