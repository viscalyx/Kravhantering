import { NextResponse } from 'next/server'
import { requestSpecificationLocalReview } from '@/lib/dal/deviations'
import { getRequestSqlServerDataSource } from '@/lib/db'
import { logSanitizedError } from '@/lib/http/safe-errors'
import {
  customMutationPolicy,
  secureMutationRoute,
} from '@/lib/http/secure-mutation-route'
import { idParamSchema } from '@/lib/http/validation'
import { isRequirementsServiceError } from '@/lib/requirements/errors'
import { toHttpErrorPayload } from '@/lib/requirements/http-errors'

export const dynamic = 'force-dynamic'

export const POST = secureMutationRoute({
  paramsSchema: idParamSchema,
  policy: customMutationPolicy(
    'specification_local_deviation.request_review',
    () => {},
  ),
  handler: async ({ params }) => {
    try {
      const db = await getRequestSqlServerDataSource()
      await requestSpecificationLocalReview(db, params.id)
      return NextResponse.json({ ok: true })
    } catch (error) {
      if (isRequirementsServiceError(error)) {
        const { body, status } = toHttpErrorPayload(error)
        return NextResponse.json(body, { status })
      }

      logSanitizedError(
        'Failed to request specification-local deviation review',
        error,
      )
      return NextResponse.json(
        { error: 'Failed to request review' },
        { status: 500 },
      )
    }
  },
})
