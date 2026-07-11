import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  accessReviewAuditActor,
  accessReviewServiceActor,
  recordAccessReviewActionSucceeded,
  recordAccessReviewAuthorizationDenied,
} from '@/lib/access-review/route-audit'
import { accessReviewErrorResponse } from '@/lib/access-review/route-helpers'
import {
  createAccessReviewRun,
  listAccessReviewRuns,
} from '@/lib/access-review/service'
import { recordSecurityEvent } from '@/lib/auth/audit'
import { getRequestSqlServerDataSource } from '@/lib/db'
import {
  customMutationPolicy,
  secureMutationRoute,
} from '@/lib/http/secure-mutation-route'
import { nullableBoundedDbStringSchema } from '@/lib/http/validation'
import {
  createRequestContext,
  requireHumanActorSnapshot,
} from '@/lib/requirements/auth'

export const dynamic = 'force-dynamic'

const isoDateTimeSchema = z.iso
  .datetime({ offset: true })
  .transform(value => new Date(value))

const createAccessReviewSchema = z
  .object({
    dueAt: isoDateTimeSchema.optional(),
    externalEvidenceReference: nullableBoundedDbStringSchema.optional(),
    periodEnd: isoDateTimeSchema.optional(),
    periodStart: isoDateTimeSchema.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.periodStart &&
      value.periodEnd &&
      value.periodStart.getTime() > value.periodEnd.getTime()
    ) {
      context.addIssue({
        code: 'custom',
        message:
          'Review period start must be earlier than or equal to its end.',
        path: ['periodEnd'],
      })
    }
  })

export async function GET(request: NextRequest) {
  try {
    const context = await createRequestContext(request, 'rest')
    const db = await getRequestSqlServerDataSource()
    const runs = await listAccessReviewRuns(
      db,
      accessReviewServiceActor(context),
    )
    return NextResponse.json({ runs })
  } catch (error) {
    return accessReviewErrorResponse('Failed to list access reviews', error)
  }
}

export const POST = secureMutationRoute({
  bodySchema: createAccessReviewSchema,
  policy: customMutationPolicy('access_review.create', () => {}),
  handler: async ({ body, context, request }) => {
    try {
      const db = await getRequestSqlServerDataSource()
      const detail = await createAccessReviewRun(
        db,
        {
          dueAt: body.dueAt,
          externalEvidenceReference: body.externalEvidenceReference ?? null,
          periodEnd: body.periodEnd,
          periodStart: body.periodStart,
          reviewer: requireHumanActorSnapshot(context),
        },
        accessReviewServiceActor(context),
        {
          audit: (executor, auditDetail) =>
            recordAccessReviewActionSucceeded(
              context,
              {
                action: 'access_review.create',
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
          itemCount: detail.run.summary.itemCount,
          reviewId: detail.run.id,
          status: detail.run.status,
        },
        event: 'access_review.created',
        outcome: 'success',
        request: context.request ?? request,
      })
      return NextResponse.json(detail, { status: 201 })
    } catch (error) {
      await recordAccessReviewAuthorizationDenied(
        context,
        request,
        { actionKind: 'access_review.create' },
        error,
      )
      return accessReviewErrorResponse('Failed to create access review', error)
    }
  },
})
