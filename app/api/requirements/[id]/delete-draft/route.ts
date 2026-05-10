import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  parseRouteParams,
  refOrPositiveIntegerSegmentSchema,
} from '@/lib/http/validation'
import { createRequirementsRestRuntime } from '@/lib/requirements/server'
import { toHttpErrorPayload } from '@/lib/requirements/service'
import { parseRequirementRef } from '../../parse-requirement-ref'

export const dynamic = 'force-dynamic'

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

  try {
    const { context, service } = await createRequirementsRestRuntime(_request)
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
