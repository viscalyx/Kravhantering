import { type NextRequest, NextResponse } from 'next/server'
import {
  accessReviewAuditActor,
  accessReviewServiceActor,
  recordAccessReviewAuthorizationDenied,
} from '@/lib/access-review/route-audit'
import {
  type AccessReviewRouteParams,
  accessReviewErrorResponse,
} from '@/lib/access-review/route-helpers'
import { completeAccessReviewRun } from '@/lib/access-review/service'
import { recordSecurityEvent } from '@/lib/auth/audit'
import { getRequestSqlServerDataSource } from '@/lib/db'
import { idParamSchema, parseRouteParams } from '@/lib/http/validation'
import {
  createRequestContext,
  type RequestContext,
} from '@/lib/requirements/auth'

export const dynamic = 'force-dynamic'

export async function POST(
  request: NextRequest,
  { params }: { params: AccessReviewRouteParams },
) {
  const parsedParams = await parseRouteParams(params, idParamSchema)
  if (!parsedParams.ok) return parsedParams.response

  let context: RequestContext | null = null
  try {
    context = await createRequestContext(request, 'rest')
    const db = await getRequestSqlServerDataSource()
    const detail = await completeAccessReviewRun(
      db,
      parsedParams.data.id,
      accessReviewServiceActor(context),
    )
    recordSecurityEvent({
      actor: accessReviewAuditActor(context),
      detail: {
        itemCount: detail.run.summary.itemCount,
        reviewId: parsedParams.data.id,
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
        reviewId: parsedParams.data.id,
      },
      error,
    )
    return accessReviewErrorResponse('Failed to complete access review', error)
  }
}
