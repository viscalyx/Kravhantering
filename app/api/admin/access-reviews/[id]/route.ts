import { type NextRequest, NextResponse } from 'next/server'
import { accessReviewServiceActor } from '@/lib/access-review/route-audit'
import { getAccessReviewRun } from '@/lib/access-review/service'
import { CsrfError } from '@/lib/auth/csrf'
import { getRequestSqlServerDataSource } from '@/lib/db'
import {
  getErrorMessage,
  logSanitizedError,
  redactSensitiveText,
} from '@/lib/http/safe-errors'
import { idParamSchema, parseRouteParams } from '@/lib/http/validation'
import { createRequestContext } from '@/lib/requirements/auth'
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

export async function GET(
  request: NextRequest,
  { params }: { params: Params },
) {
  const parsedParams = await parseRouteParams(params, idParamSchema)
  if (!parsedParams.ok) return parsedParams.response

  try {
    const context = await createRequestContext(request, 'rest')
    const db = await getRequestSqlServerDataSource()
    const detail = await getAccessReviewRun(
      db,
      parsedParams.data.id,
      accessReviewServiceActor(context),
    )
    return NextResponse.json(detail)
  } catch (error) {
    return errorResponse('Failed to load access review', error)
  }
}
