import { NextResponse } from 'next/server'
import { z } from 'zod'
import {
  accessReviewAuditActor,
  accessReviewServiceActor,
  recordAccessReviewAuthorizationDenied,
} from '@/lib/access-review/route-audit'
import {
  accessReviewErrorResponse,
  addNoStore,
} from '@/lib/access-review/route-helpers'
import { buildAccessReviewExport } from '@/lib/access-review/service'
import { recordSecurityEvent } from '@/lib/auth/audit'
import { getRequestSqlServerDataSource } from '@/lib/db'
import {
  customMutationPolicy,
  secureMutationRoute,
} from '@/lib/http/secure-mutation-route'
import { idParamSchema } from '@/lib/http/validation'

export const dynamic = 'force-dynamic'

const exportSchema = z
  .object({
    delivery: z.union([z.literal('json'), z.literal('pdf')]),
  })
  .strict()

export const POST = secureMutationRoute({
  bodySchema: exportSchema,
  decorateErrorResponse: addNoStore,
  paramsSchema: idParamSchema,
  policy: customMutationPolicy('access_review.export', () => {}),
  handler: async ({ body, context, params, request }) => {
    try {
      const db = await getRequestSqlServerDataSource()
      const exportPayload = await buildAccessReviewExport(
        db,
        params.id,
        accessReviewServiceActor(context),
      )
      recordSecurityEvent({
        actor: accessReviewAuditActor(context),
        detail: {
          delivery: body.delivery,
          itemCount: exportPayload.run.summary.itemCount,
          reviewId: params.id,
          status: exportPayload.run.status,
        },
        event: 'access_review.exported',
        outcome: 'success',
        request: context.request ?? request,
      })
      return NextResponse.json(exportPayload, {
        headers: { 'Cache-Control': 'no-store' },
      })
    } catch (error) {
      recordAccessReviewAuthorizationDenied(
        context,
        request,
        {
          actionKind: 'access_review.export',
          delivery: body.delivery,
          reviewId: params.id,
        },
        error,
      )
      return accessReviewErrorResponse(
        'Failed to export access review',
        error,
        {
          noStore: true,
        },
      )
    }
  },
})
