import { NextResponse } from 'next/server'
import { z } from 'zod'
import {
  accessReviewAuditActor,
  accessReviewServiceActor,
  recordAccessReviewActionSucceeded,
  recordAccessReviewAuthorizationDenied,
} from '@/lib/access-review/route-audit'
import { accessReviewErrorResponse } from '@/lib/access-review/route-helpers'
import { decideAccessReviewItem } from '@/lib/access-review/service'
import { recordSecurityEvent } from '@/lib/auth/audit'
import { getRequestSqlServerDataSource } from '@/lib/db'
import {
  customMutationPolicy,
  secureMutationRoute,
} from '@/lib/http/secure-mutation-route'
import {
  nullableBusinessTextSchema,
  positiveIntegerStringSchema,
} from '@/lib/http/validation'

export const dynamic = 'force-dynamic'

const paramsSchema = z
  .object({
    id: positiveIntegerStringSchema,
    itemId: positiveIntegerStringSchema,
  })
  .strict()

const decisionSchema = z
  .object({
    comment: nullableBusinessTextSchema.optional(),
    decision: z.enum([
      'approved',
      'revoke_required',
      'changed',
      'not_applicable',
    ]),
  })
  .strict()

export const PATCH = secureMutationRoute({
  bodySchema: decisionSchema,
  paramsSchema,
  policy: customMutationPolicy('access_review.item_decide', () => {}),
  handler: async ({ body, context, params, request }) => {
    try {
      const db = await getRequestSqlServerDataSource()
      const result = await decideAccessReviewItem(
        db,
        params.id,
        params.itemId,
        body,
        accessReviewServiceActor(context),
        {
          audit: (executor, auditDetail) =>
            recordAccessReviewActionSucceeded(
              context,
              {
                action: 'access_review.item_decide',
                detail: {
                  decision: auditDetail.decision,
                  itemId: auditDetail.itemId,
                  reviewId: auditDetail.runId,
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
          decision: body.decision,
          itemId: params.itemId,
          reviewId: params.id,
        },
        event: 'access_review.item_decided',
        outcome: 'success',
        request: context.request ?? request,
      })
      return NextResponse.json(result.detail)
    } catch (error) {
      await recordAccessReviewAuthorizationDenied(
        context,
        request,
        {
          actionKind: 'access_review.item_decide',
          itemId: params.itemId,
          reviewId: params.id,
        },
        error,
      )
      return accessReviewErrorResponse(
        'Failed to decide access review item',
        error,
      )
    }
  },
})
