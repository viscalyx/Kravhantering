import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  accessReviewAuditActor,
  accessReviewServiceActor,
  recordAccessReviewAuthorizationDenied,
} from '@/lib/access-review/route-audit'
import {
  type AccessReviewItemRouteParams,
  accessReviewErrorResponse,
} from '@/lib/access-review/route-helpers'
import { decideAccessReviewItem } from '@/lib/access-review/service'
import { recordSecurityEvent } from '@/lib/auth/audit'
import { getRequestSqlServerDataSource } from '@/lib/db'
import {
  nullableBusinessTextSchema,
  parseRouteParams,
  positiveIntegerStringSchema,
  readJsonWithSchema,
} from '@/lib/http/validation'
import {
  createRequestContext,
  type RequestContext,
} from '@/lib/requirements/auth'

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

export async function PATCH(
  request: NextRequest,
  { params }: { params: AccessReviewItemRouteParams },
) {
  const parsedParams = await parseRouteParams(params, paramsSchema)
  if (!parsedParams.ok) return parsedParams.response
  const parsedBody = await readJsonWithSchema(request, decisionSchema)
  if (!parsedBody.ok) return parsedBody.response

  let context: RequestContext | null = null
  try {
    context = await createRequestContext(request, 'rest')
    const db = await getRequestSqlServerDataSource()
    const detail = await decideAccessReviewItem(
      db,
      parsedParams.data.id,
      parsedParams.data.itemId,
      parsedBody.data,
      accessReviewServiceActor(context),
    )
    recordSecurityEvent({
      actor: accessReviewAuditActor(context),
      detail: {
        decision: parsedBody.data.decision,
        itemId: parsedParams.data.itemId,
        reviewId: parsedParams.data.id,
      },
      event: 'access_review.item_decided',
      outcome: 'success',
      request: context.request ?? request,
    })
    return NextResponse.json(detail)
  } catch (error) {
    recordAccessReviewAuthorizationDenied(
      context,
      request,
      {
        actionKind: 'access_review.item_decide',
        itemId: parsedParams.data.itemId,
        reviewId: parsedParams.data.id,
      },
      error,
    )
    return accessReviewErrorResponse(
      'Failed to decide access review item',
      error,
    )
  }
}
