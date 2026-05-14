import { NextResponse } from 'next/server'
import { z } from 'zod'
import {
  DEVIATION_APPROVED,
  DEVIATION_REJECTED,
  recordSpecificationLocalDecision,
} from '@/lib/dal/deviations'
import { getRequestSqlServerDataSource } from '@/lib/db'
import { logSanitizedError } from '@/lib/http/safe-errors'
import {
  customMutationPolicy,
  secureMutationRoute,
} from '@/lib/http/secure-mutation-route'
import { businessTextSchema, idParamSchema } from '@/lib/http/validation'
import { requireHumanActorSnapshot } from '@/lib/requirements/auth'
import { isRequirementsServiceError } from '@/lib/requirements/errors'
import { toHttpErrorPayload } from '@/lib/requirements/http-errors'

export const dynamic = 'force-dynamic'

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

export const POST = secureMutationRoute({
  bodySchema: decisionBodySchema,
  paramsSchema: idParamSchema,
  policy: customMutationPolicy(
    'specification_local_deviation.decision',
    ({ context }) => {
      requireHumanActorSnapshot(context)
    },
  ),
  handler: async ({ body, context, params }) => {
    try {
      const db = await getRequestSqlServerDataSource()
      const actor = requireHumanActorSnapshot(context)
      await recordSpecificationLocalDecision(db, params.id, {
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

      logSanitizedError(
        'Failed to record specification-local deviation decision',
        error,
      )
      return NextResponse.json(
        { error: 'Failed to record decision' },
        { status: 500 },
      )
    }
  },
})
