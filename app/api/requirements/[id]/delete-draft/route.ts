import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getRequestSqlServerDataSource } from '@/lib/db'
import {
  parseRouteParams,
  refOrPositiveIntegerSegmentSchema,
} from '@/lib/http/validation'
import { createRequestContext } from '@/lib/requirements/auth'
import {
  createRequirementsService,
  toHttpErrorPayload,
} from '@/lib/requirements/service'
import { parseRequirementRef } from '../../parse-requirement-ref'

type Params = Promise<{ id: string }>

const requirementRefParamsSchema = z
  .object({
    id: refOrPositiveIntegerSegmentSchema,
  })
  .strict()

export async function POST(
  _request: NextRequest,
  { params }: { params: Params },
) {
  const parsedParams = await parseRouteParams(
    params,
    requirementRefParamsSchema,
  )
  if (!parsedParams.ok) return parsedParams.response
  const { id } = parsedParams.data
  const db = await getRequestSqlServerDataSource()
  const service = createRequirementsService(db)

  try {
    const context = await createRequestContext(_request, 'rest')
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
