import { NextResponse } from 'next/server'
import { CsrfError } from '@/lib/auth/csrf'
import {
  getErrorMessage,
  logSanitizedError,
  redactSensitiveText,
} from '@/lib/http/safe-errors'
import { isRequirementsServiceError } from '@/lib/requirements/errors'
import { toHttpErrorPayload } from '@/lib/requirements/http-errors'

export type AccessReviewRouteParams = Promise<{ id: string }>

export type AccessReviewItemRouteParams = Promise<{
  id: string
  itemId: string
}>

function unexpectedErrorBody(message: string, error: unknown) {
  return {
    ...(process.env.NODE_ENV === 'development'
      ? { debugMessage: redactSensitiveText(getErrorMessage(error)) }
      : {}),
    error: message,
  }
}

export function accessReviewErrorResponse(
  message: string,
  error: unknown,
): NextResponse {
  let response: NextResponse

  if (error instanceof CsrfError || isRequirementsServiceError(error)) {
    const { body, status } = toHttpErrorPayload(error)
    response = NextResponse.json(body, { status })
  } else {
    logSanitizedError(message, error)
    response = NextResponse.json(unexpectedErrorBody(message, error), {
      status: 500,
    })
  }

  return response
}
