import { type NextRequest, NextResponse } from 'next/server'
import {
  accessReviewAuditActor,
  accessReviewServiceActor,
  recordAccessReviewAuthorizationDenied,
} from '@/lib/access-review/route-audit'
import { cancelAccessReviewRun } from '@/lib/access-review/service'
import { recordSecurityEvent } from '@/lib/auth/audit'
import { CsrfError } from '@/lib/auth/csrf'
import { getRequestSqlServerDataSource } from '@/lib/db'
import {
  getErrorMessage,
  logSanitizedError,
  redactSensitiveText,
} from '@/lib/http/safe-errors'
import { idParamSchema, parseRouteParams } from '@/lib/http/validation'
import {
  createRequestContext,
  type RequestContext,
} from '@/lib/requirements/auth'
import { isRequirementsServiceError } from '@/lib/requirements/errors'
import { toHttpErrorPayload } from '@/lib/requirements/http-errors'

export const dynamic = 'force-dynamic'

type Params = Promise<{ id: string }>

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
    return NextResponse.json(body, { status })
  }
  logSanitizedError(message, error)
  return NextResponse.json(unexpectedErrorBody(message, error), {
    status: 500,
  })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Params },
) {
  const parsedParams = await parseRouteParams(params, idParamSchema)
  if (!parsedParams.ok) return parsedParams.response

  let context: RequestContext | null = null
  try {
    context = await createRequestContext(request, 'rest')
    const db = await getRequestSqlServerDataSource()
    const detail = await cancelAccessReviewRun(
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
      event: 'access_review.cancelled',
      outcome: 'success',
      request: context.request ?? request,
    })
    return NextResponse.json(detail)
  } catch (error) {
    recordAccessReviewAuthorizationDenied(
      context,
      request,
      {
        actionKind: 'access_review.cancel',
        reviewId: parsedParams.data.id,
      },
      error,
    )
    return errorResponse('Failed to cancel access review', error)
  }
}
