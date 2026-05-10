import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getRequestSqlServerDataSource } from '@/lib/db'
import {
  parseRouteParams,
  positiveIntegerSchema,
  readJsonWithSchema,
  refOrPositiveIntegerSegmentSchema,
} from '@/lib/http/validation'
import { createRequestContext } from '@/lib/requirements/auth'
import {
  createRequirementsService,
  toHttpErrorPayload,
} from '@/lib/requirements/service'
import { parseRequirementRef } from '../../requirements/parse-requirement-ref'

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
  const db = await getRequestSqlServerDataSource()
  const service = createRequirementsService(db)

  try {
    const context = await createRequestContext(request, 'rest')
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
