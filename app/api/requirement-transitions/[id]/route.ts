import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  parseRouteParams,
  positiveIntegerSchema,
  readJsonWithSchema,
  refOrPositiveIntegerSegmentSchema,
} from '@/lib/http/validation'
import { createRequirementsRestRuntime } from '@/lib/requirements/server'
import { toHttpErrorPayload } from '@/lib/requirements/service'
import { parseRequirementRef } from '../../requirements/parse-requirement-ref'

export const dynamic = 'force-dynamic'

type Params = Promise<{ id: string }>

const requirementRefParamsSchema = z
  .object({
    id: refOrPositiveIntegerSegmentSchema,
  })
  .strict()

const transitionBodySchema = z
  .object({
    statusId: positiveIntegerSchema,
  })
  .strict()

export async function POST(
  request: NextRequest,
  { params }: { params: Params },
) {
  const parsedParams = await parseRouteParams(
    params,
    requirementRefParamsSchema,
  )
  if (!parsedParams.ok) return parsedParams.response
  const { id } = parsedParams.data
  const parsedBody = await readJsonWithSchema(request, transitionBodySchema)
  if (!parsedBody.ok) return parsedBody.response
  const { statusId } = parsedBody.data

  try {
    const { context, service } = await createRequirementsRestRuntime(request)
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
