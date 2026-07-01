import { NextResponse } from 'next/server'
import { z } from 'zod'
import {
  DEVIATION_APPROVED,
  DEVIATION_REJECTED,
  recordDecision,
} from '@/lib/dal/deviations'
import { getRequestSqlServerDataSource } from '@/lib/db'
import { logSanitizedError } from '@/lib/http/safe-errors'
import {
  requirementsMutationPolicy,
  secureMutationRoute,
} from '@/lib/http/secure-mutation-route'
import { businessTextSchema, idParamSchema } from '@/lib/http/validation'
import { requireHumanActorSnapshot } from '@/lib/requirements/auth'
import { isRequirementsServiceError } from '@/lib/requirements/errors'
import { toHttpErrorPayload } from '@/lib/requirements/http-errors'

export const dynamic = 'force-dynamic'

const decisionBodySchema = z
  .object({
    decision: z.union([
      z.literal(DEVIATION_APPROVED),
      z.literal(DEVIATION_REJECTED),
    ]),
    decisionMotivation: businessTextSchema,
  })
  .strict()

export const POST = secureMutationRoute({
  bodySchema: decisionBodySchema,
  errorMessage: 'Failed to record decision',
  paramsSchema: idParamSchema,
  policy: requirementsMutationPolicy<unknown, { id: number }>(({ params }) => ({
    deviationId: params.id,
    kind: 'manage_deviation',
    operation: 'record_decision',
  })),
  handler: async ({ body, context, db: authorizedDb, params }) => {
    try {
      const actor = requireHumanActorSnapshot(context)
      const db = authorizedDb ?? (await getRequestSqlServerDataSource())
      await recordDecision(db, params.id, {
        decision: body.decision,
        decisionMotivation: body.decisionMotivation,
        decidedBy: actor.displayName,
        decidedByHsaId: actor.hsaId,
      })
      return NextResponse.json({ ok: true })
    } catch (error) {
      if (isRequirementsServiceError(error)) {
        const { body, status } = toHttpErrorPayload(error)
        return NextResponse.json(body, { status })
      }
      logSanitizedError('Failed to record deviation decision', error)
      return NextResponse.json(
        { error: 'Failed to record decision' },
        { status: 500 },
      )
    }
  },
})
