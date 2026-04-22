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
  _request: NextRequest,
  { params }: { params: Params },
) {
  const { id } = await params
  const db = await getRequestSqlServerDataSource()
  const service = createRequirementsService(db)
  const context = await createRequestContext(_request, 'rest')

  try {
    const ref = parseRequirementRef(id)
    const result = await service.manageRequirement(context, {
      ...ref,
      operation: 'delete_draft',
    })
    return NextResponse.json(result.result)
  } catch (error) {
    const { body, status } = toHttpErrorPayload(error)
    return NextResponse.json(body, { status })
  }
}
