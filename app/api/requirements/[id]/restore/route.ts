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
import { parseRequirementRef } from '../../parse-requirement-ref'

export const dynamic = 'force-dynamic'

type Params = Promise<{ id: string }>

const requirementRefParamsSchema = z
  .object({
    id: refOrPositiveIntegerSegmentSchema,
  })
  .strict()

const restoreBodySchema = z
  .object({
    versionNumber: positiveIntegerSchema,
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
  const parsedBody = await readJsonWithSchema(request, restoreBodySchema)
  if (!parsedBody.ok) return parsedBody.response
  const { versionNumber } = parsedBody.data

  try {
    const { context, service } = await createRequirementsRestRuntime(request)
    const ref = parseRequirementRef(id)
    const result = await service.manageRequirement(context, {
      ...ref,
      operation: 'restore_version',
      versionNumber,
    })
    return NextResponse.json({ ok: true, version: result.result })
  } catch (error) {
    const { body: errorBody, status } = toHttpErrorPayload(error)
    return NextResponse.json(errorBody, { status })
  }
}
