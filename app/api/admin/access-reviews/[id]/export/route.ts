import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  accessReviewAuditActor,
  accessReviewServiceActor,
  recordAccessReviewAuthorizationDenied,
} from '@/lib/access-review/route-audit'
import {
  type AccessReviewRouteParams,
  accessReviewErrorResponse,
  addNoStore,
} from '@/lib/access-review/route-helpers'
import { buildAccessReviewExport } from '@/lib/access-review/service'
import { recordSecurityEvent } from '@/lib/auth/audit'
import { getRequestSqlServerDataSource } from '@/lib/db'
import {
  idParamSchema,
  parseRouteParams,
  readJsonWithSchema,
} from '@/lib/http/validation'
import {
  createRequestContext,
  type RequestContext,
} from '@/lib/requirements/auth'

export const dynamic = 'force-dynamic'

const exportSchema = z
  .object({
    delivery: z.union([z.literal('json'), z.literal('pdf')]),
  })
  .strict()

export async function POST(
  request: NextRequest,
  { params }: { params: AccessReviewRouteParams },
) {
  const parsedParams = await parseRouteParams(params, idParamSchema)
  if (!parsedParams.ok) {
    return addNoStore(parsedParams.response)
  }
  const parsedBody = await readJsonWithSchema(request, exportSchema)
  if (!parsedBody.ok) {
    return addNoStore(parsedBody.response)
  }

  let context: RequestContext | null = null
  try {
    context = await createRequestContext(request, 'rest')
    const db = await getRequestSqlServerDataSource()
    const exportPayload = await buildAccessReviewExport(
      db,
      parsedParams.data.id,
      accessReviewServiceActor(context),
    )
    recordSecurityEvent({
      actor: accessReviewAuditActor(context),
      detail: {
        delivery: parsedBody.data.delivery,
        itemCount: exportPayload.run.summary.itemCount,
        reviewId: parsedParams.data.id,
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
        delivery: parsedBody.data.delivery,
        reviewId: parsedParams.data.id,
      },
      error,
    )
    return accessReviewErrorResponse('Failed to export access review', error, {
      noStore: true,
    })
  }
}
