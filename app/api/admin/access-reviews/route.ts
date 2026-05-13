import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  accessReviewAuditActor,
  accessReviewServiceActor,
  recordAccessReviewAuthorizationDenied,
} from '@/lib/access-review/route-audit'
import {
  createAccessReviewRun,
  listAccessReviewRuns,
} from '@/lib/access-review/service'
import { recordSecurityEvent } from '@/lib/auth/audit'
import { CsrfError } from '@/lib/auth/csrf'
import { getRequestSqlServerDataSource } from '@/lib/db'
import {
  getErrorMessage,
  logSanitizedError,
  redactSensitiveText,
} from '@/lib/http/safe-errors'
import {
  nullableBoundedDbStringSchema,
  readJsonWithSchema,
} from '@/lib/http/validation'
import {
  createRequestContext,
  type RequestContext,
  requireHumanActorSnapshot,
} from '@/lib/requirements/auth'
import { isRequirementsServiceError } from '@/lib/requirements/errors'
import { toHttpErrorPayload } from '@/lib/requirements/http-errors'

export const dynamic = 'force-dynamic'

const dateSchema = z
  .string()
  .trim()
  .refine(value => !Number.isNaN(new Date(value).getTime()), {
    message: 'Expected an ISO date-time string.',
  })
  .transform(value => new Date(value))

const createAccessReviewSchema = z
  .object({
    dueAt: dateSchema.optional(),
    externalEvidenceReference: nullableBoundedDbStringSchema.optional(),
    periodEnd: dateSchema.optional(),
    periodStart: dateSchema.optional(),
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
    return NextResponse.json(body, { status })
  }
  logSanitizedError(message, error)
  return NextResponse.json(unexpectedErrorBody(message, error), {
    status: 500,
  })
}

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
    return errorResponse('Failed to list access reviews', error)
  }
}

export async function POST(request: NextRequest) {
  const parsedBody = await readJsonWithSchema(request, createAccessReviewSchema)
  if (!parsedBody.ok) return parsedBody.response

  let context: RequestContext | null = null
  try {
    context = await createRequestContext(request, 'rest')
    const db = await getRequestSqlServerDataSource()
    const detail = await createAccessReviewRun(
      db,
      {
        dueAt: parsedBody.data.dueAt,
        externalEvidenceReference:
          parsedBody.data.externalEvidenceReference ?? null,
        periodEnd: parsedBody.data.periodEnd,
        periodStart: parsedBody.data.periodStart,
        reviewer: requireHumanActorSnapshot(context),
      },
      accessReviewServiceActor(context),
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
    recordAccessReviewAuthorizationDenied(
      context,
      request,
      { actionKind: 'access_review.create' },
      error,
    )
    return errorResponse('Failed to create access review', error)
  }
}
