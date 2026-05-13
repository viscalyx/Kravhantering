import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  accessReviewAuditActor,
  accessReviewServiceActor,
  recordAccessReviewAuthorizationDenied,
} from '@/lib/access-review/route-audit'
import { buildAccessReviewExport } from '@/lib/access-review/service'
import { recordSecurityEvent } from '@/lib/auth/audit'
import { CsrfError } from '@/lib/auth/csrf'
import { getRequestSqlServerDataSource } from '@/lib/db'
import {
  getErrorMessage,
  logSanitizedError,
  redactSensitiveText,
} from '@/lib/http/safe-errors'
import {
  idParamSchema,
  parseRouteParams,
  readJsonWithSchema,
} from '@/lib/http/validation'
import {
  createRequestContext,
  type RequestContext,
} from '@/lib/requirements/auth'
import { isRequirementsServiceError } from '@/lib/requirements/errors'
import { toHttpErrorPayload } from '@/lib/requirements/http-errors'

export const dynamic = 'force-dynamic'

type Params = Promise<{ id: string }>

const exportSchema = z
  .object({
    delivery: z.union([z.literal('json'), z.literal('pdf')]),
  })
  .strict()

function unexpectedErrorBody(message: string, error: unknown) {
  return {
    ...(process.env.NODE_ENV === 'development'
      ? { debugMessage: redactSensitiveText(getErrorMessage(error)) }
      : {}),
    error: message,
  }
}

function errorResponse(message: string, error: unknown) {
  if (error instanceof CsrfError || isRequirementsServiceError(error)) {
    const { body, status } = toHttpErrorPayload(error)
    return NextResponse.json(body, {
      headers: { 'Cache-Control': 'no-store' },
      status,
    })
  }
  logSanitizedError(message, error)
  return NextResponse.json(unexpectedErrorBody(message, error), {
    headers: { 'Cache-Control': 'no-store' },
    status: 500,
  })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Params },
) {
  const parsedParams = await parseRouteParams(params, idParamSchema)
  if (!parsedParams.ok) {
    parsedParams.response.headers.set('Cache-Control', 'no-store')
    return parsedParams.response
  }
  const parsedBody = await readJsonWithSchema(request, exportSchema)
  if (!parsedBody.ok) {
    parsedBody.response.headers.set('Cache-Control', 'no-store')
    return parsedBody.response
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
    return errorResponse('Failed to export access review', error)
  }
}
