import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { recordSecurityEvent } from '@/lib/auth/audit'
import { CsrfError } from '@/lib/auth/csrf'
import { isHsaId } from '@/lib/auth/hsa-id'
import { getRequestSqlServerDataSource } from '@/lib/db'
import {
  getErrorMessage,
  logSanitizedError,
  redactSensitiveText,
} from '@/lib/http/safe-errors'
import {
  boundedDbStringSchema,
  optionalBoundedDbStringSchema,
  readJsonWithSchema,
} from '@/lib/http/validation'
import {
  executePrivacyErasure,
  type PrivacyErasureAction,
} from '@/lib/privacy/erasure'
import {
  createRequestContext,
  type RequestContext,
  requireHumanActorSnapshot,
} from '@/lib/requirements/auth'
import {
  forbiddenError,
  isRequirementsServiceError,
} from '@/lib/requirements/errors'
import { toHttpErrorPayload } from '@/lib/requirements/http-errors'

export const dynamic = 'force-dynamic'

const hsaIdSchema = boundedDbStringSchema.refine(isHsaId, {
  message: 'HSA-ID must use format SE<10-digit org no>-<alphanumeric suffix>.',
})

const actionSchema = z.union([
  z.literal('anonymize'),
  z.literal('delete'),
  z.literal('skip'),
  z.literal('switch'),
])

const replacementSchema = z
  .object({
    displayName: boundedDbStringSchema,
    email: optionalBoundedDbStringSchema.refine(
      value => value == null || z.email().safeParse(value).success,
      { message: 'Replacement email must be a valid email address.' },
    ),
    firstName: optionalBoundedDbStringSchema,
    hsaId: hsaIdSchema,
    lastName: optionalBoundedDbStringSchema,
  })
  .strict()

const erasureRequestSchema = z
  .object({
    actions: z.record(z.string(), actionSchema).optional(),
    previewToken: boundedDbStringSchema,
    replacement: replacementSchema.nullable().optional(),
    target: z
      .object({
        hsaId: hsaIdSchema,
      })
      .strict(),
  })
  .strict()

function assertPrivacyOfficer(context: RequestContext): void {
  if (!context.actor.roles.includes('PrivacyOfficer')) {
    throw forbiddenError('PrivacyOfficer role is required', {
      reason: 'privacy_officer_required',
    })
  }
  requireHumanActorSnapshot(context)
}

function auditActor(context: RequestContext) {
  return {
    hsaId: context.actor.hsaId ?? undefined,
    source: context.actor.source,
    sub: context.actor.id ?? undefined,
  }
}

function unexpectedErrorBody(message: string, error: unknown) {
  return {
    ...(process.env.NODE_ENV === 'development'
      ? { debugMessage: redactSensitiveText(getErrorMessage(error)) }
      : {}),
    error: message,
  }
}

export async function POST(request: NextRequest) {
  const parsedBody = await readJsonWithSchema(request, erasureRequestSchema)
  if (!parsedBody.ok) return parsedBody.response

  try {
    const context = await createRequestContext(request, 'rest')
    assertPrivacyOfficer(context)
    const db = await getRequestSqlServerDataSource()
    const result = await executePrivacyErasure(db, {
      actions: parsedBody.data.actions as
        | Record<string, PrivacyErasureAction>
        | undefined,
      previewToken: parsedBody.data.previewToken,
      replacement: parsedBody.data.replacement ?? null,
      target: parsedBody.data.target,
    })
    recordSecurityEvent({
      actor: auditActor(context),
      detail: {
        anonymizeCount: result.actions.anonymize,
        deleteCount: result.actions.delete,
        erasureRequestId: result.requestId,
        skipCount: result.actions.skip,
        switchCount: result.actions.switch,
        targetFingerprint: result.targetFingerprint,
        totalCount: result.totalCount,
      },
      event: 'privacy.erasure.executed',
      outcome: 'success',
      request: context.request ?? request,
    })
    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    if (error instanceof CsrfError || isRequirementsServiceError(error)) {
      const { body, status } = toHttpErrorPayload(error)
      return NextResponse.json(body, { status })
    }
    logSanitizedError('Failed to execute privacy erasure', error)
    return NextResponse.json(
      unexpectedErrorBody('Failed to execute privacy erasure', error),
      { status: 500 },
    )
  }
}
