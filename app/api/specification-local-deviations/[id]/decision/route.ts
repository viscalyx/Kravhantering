import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  DEVIATION_APPROVED,
  DEVIATION_REJECTED,
  recordSpecificationLocalDecision,
} from '@/lib/dal/deviations'
import { getRequestSqlServerDataSource } from '@/lib/db'
import { logSanitizedError } from '@/lib/http/safe-errors'
import {
  businessTextSchema,
  idParamSchema,
  parseRouteParams,
  readJsonWithSchema,
} from '@/lib/http/validation'
import {
  createRequestContext,
  requireHumanActorSnapshot,
} from '@/lib/requirements/auth'
import { isRequirementsServiceError } from '@/lib/requirements/errors'
import { toHttpErrorPayload } from '@/lib/requirements/http-errors'

export const dynamic = 'force-dynamic'

type Params = Promise<{ id: string }>

const decisionBodySchema = z
  .object({
    decidedBy: businessTextSchema.optional(),
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

  try {
    const db = await getRequestSqlServerDataSource()
    const context = await createRequestContext(request, 'rest')
    const actor = requireHumanActorSnapshot(context)
    await recordSpecificationLocalDecision(db, parsedParams.data.id, {
      decision: parsedBody.data.decision,
      decisionMotivation: parsedBody.data.decisionMotivation,
      decidedBy: actor.displayName,
      decidedByHsaId: actor.hsaId,
    })
    return NextResponse.json({ ok: true })
  } catch (error) {
    if (isRequirementsServiceError(error)) {
      const { body, status } = toHttpErrorPayload(error)
      return NextResponse.json(body, { status })
    }

    logSanitizedError(
      'Failed to record specification-local deviation decision',
      error,
    )
    return NextResponse.json(
      { error: 'Failed to record decision' },
      { status: 500 },
    )
  }
}
