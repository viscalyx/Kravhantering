import { NextResponse } from 'next/server'
import { revertToDraft } from '@/lib/dal/deviations'
import { getRequestSqlServerDataSource } from '@/lib/db'
import { logSanitizedError } from '@/lib/http/safe-errors'
import {
  customMutationPolicy,
  secureMutationRoute,
} from '@/lib/http/secure-mutation-route'
import { idParamSchema } from '@/lib/http/validation'
import { requireHumanActorSnapshot } from '@/lib/requirements/auth'
import { isRequirementsServiceError } from '@/lib/requirements/errors'
import { toHttpErrorPayload } from '@/lib/requirements/http-errors'

export const dynamic = 'force-dynamic'

export const POST = secureMutationRoute({
  paramsSchema: idParamSchema,
  policy: customMutationPolicy('deviation.revert_to_draft', ({ context }) => {
    requireHumanActorSnapshot(context)
  }),
  handler: async ({ params }) => {
    const db = await getRequestSqlServerDataSource()

    try {
      await revertToDraft(db, params.id)
      return NextResponse.json({ ok: true })
    } catch (error) {
      if (isRequirementsServiceError(error)) {
        const { body, status } = toHttpErrorPayload(error)
        return NextResponse.json(body, { status })
      }
      logSanitizedError('Failed to revert deviation to draft', error)
      return NextResponse.json(
        { error: 'Failed to revert to draft' },
        { status: 500 },
      )
    }
  },
})
