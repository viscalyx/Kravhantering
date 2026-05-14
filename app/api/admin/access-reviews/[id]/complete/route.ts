import { NextResponse } from 'next/server'
import {
  accessReviewAuditActor,
  accessReviewServiceActor,
  recordAccessReviewAuthorizationDenied,
} from '@/lib/access-review/route-audit'
import { accessReviewErrorResponse } from '@/lib/access-review/route-helpers'
import { completeAccessReviewRun } from '@/lib/access-review/service'
import { recordSecurityEvent } from '@/lib/auth/audit'
import { getRequestSqlServerDataSource } from '@/lib/db'
import {
  customMutationPolicy,
  secureMutationRoute,
} from '@/lib/http/secure-mutation-route'
import { idParamSchema } from '@/lib/http/validation'

export const dynamic = 'force-dynamic'

export const POST = secureMutationRoute({
  paramsSchema: idParamSchema,
  policy: customMutationPolicy('access_review.complete', () => {}),
  handler: async ({ context, params, request }) => {
    try {
      const db = await getRequestSqlServerDataSource()
      const detail = await completeAccessReviewRun(
        db,
        params.id,
        accessReviewServiceActor(context),
      )
      recordSecurityEvent({
        actor: accessReviewAuditActor(context),
        detail: {
          itemCount: detail.run.summary.itemCount,
          reviewId: params.id,
          status: detail.run.status,
        },
        event: 'access_review.completed',
        outcome: 'success',
        request: context.request ?? request,
      })
      return NextResponse.json(detail)
    } catch (error) {
      recordAccessReviewAuthorizationDenied(
        context,
        request,
        {
          actionKind: 'access_review.complete',
          reviewId: params.id,
        },
        error,
      )
      return accessReviewErrorResponse(
        'Failed to complete access review',
        error,
      )
    }
  },
})
