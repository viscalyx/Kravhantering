import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  recordResolution,
  SUGGESTION_DISMISSED,
  SUGGESTION_RESOLVED,
} from '@/lib/dal/improvement-suggestions'
import { getRequestSqlServerDataSource } from '@/lib/db'
import {
  businessTextSchema,
  idParamSchema,
  parseRouteParams,
  readJsonWithSchema,
} from '@/lib/http/validation'
import { isRequirementsServiceError } from '@/lib/requirements/errors'

type Params = Promise<{ id: string }>

const resolutionBodySchema = z
  .object({
    resolution: z.union([
      z.literal(SUGGESTION_RESOLVED),
      z.literal(SUGGESTION_DISMISSED),
    ]),
    resolutionMotivation: businessTextSchema,
    resolvedBy: businessTextSchema,
  })
  .strict()

export async function POST(
  request: NextRequest,
  { params }: { params: Params },
) {
  const parsedParams = await parseRouteParams(params, idParamSchema)
  if (!parsedParams.ok) return parsedParams.response
  const parsedBody = await readJsonWithSchema(request, resolutionBodySchema)
  if (!parsedBody.ok) return parsedBody.response
  const db = await getRequestSqlServerDataSource()

  try {
    await recordResolution(db, parsedParams.data.id, parsedBody.data)
    return NextResponse.json({ ok: true })
  } catch (error) {
    if (isRequirementsServiceError(error)) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      )
    }
    console.error('Failed to record suggestion resolution', error)
    return NextResponse.json(
      { error: 'Failed to record resolution' },
      { status: 500 },
    )
  }
}
