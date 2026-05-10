import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  DEVIATION_APPROVED,
  DEVIATION_REJECTED,
  recordDecision,
} from '@/lib/dal/deviations'
import { getRequestSqlServerDataSource } from '@/lib/db'
import {
  businessTextSchema,
  idParamSchema,
  parseRouteParams,
  readJsonWithSchema,
} from '@/lib/http/validation'
import { isRequirementsServiceError } from '@/lib/requirements/errors'

export const dynamic = 'force-dynamic'

type Params = Promise<{ id: string }>

const decisionBodySchema = z
  .object({
    decidedBy: businessTextSchema,
    decision: z.union([
      z.literal(DEVIATION_APPROVED),
      z.literal(DEVIATION_REJECTED),
    ]),
    decisionMotivation: businessTextSchema,
  })
  .strict()

export async function POST(
  request: NextRequest,
  { params }: { params: Params },
) {
  const parsedParams = await parseRouteParams(params, idParamSchema)
  if (!parsedParams.ok) return parsedParams.response
  const parsedBody = await readJsonWithSchema(request, decisionBodySchema)
  if (!parsedBody.ok) return parsedBody.response
  const db = await getRequestSqlServerDataSource()

  try {
    await recordDecision(db, parsedParams.data.id, parsedBody.data)
    return NextResponse.json({ ok: true })
  } catch (error) {
    if (isRequirementsServiceError(error)) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      )
    }
    console.error('Failed to record deviation decision', error)
    return NextResponse.json(
      { error: 'Failed to record decision' },
      { status: 500 },
    )
  }
}
