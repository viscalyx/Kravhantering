import { NextResponse } from 'next/server'
import {
  accessReviewAuditActor,
  accessReviewServiceActor,
  recordAccessReviewActionSucceeded,
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
      const result = await completeAccessReviewRun(
        db,
        params.id,
        accessReviewServiceActor(context),
        {
          audit: (executor, auditDetail) =>
            recordAccessReviewActionSucceeded(
              context,
              {
                action: 'access_review.complete',
                detail: {
                  itemCount: auditDetail.itemCount,
                  reviewId: auditDetail.runId,
                  status: auditDetail.status,
                },
                targetId: auditDetail.runId,
              },
              executor,
            ),
        },
      )
      recordSecurityEvent({
        actor: accessReviewAuditActor(context),
        detail: {
          changed: result.applied,
          itemCount: result.detail.run.summary.itemCount,
          reviewId: params.id,
          status: result.detail.run.status,
        },
        event: 'access_review.completed',
        outcome: 'success',
        request: context.request ?? request,
      })
      return NextResponse.json(result.detail)
    } catch (error) {
      await recordAccessReviewAuthorizationDenied(
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
