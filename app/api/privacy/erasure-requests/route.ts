import { NextResponse } from 'next/server'
import { z } from 'zod'
import { recordAllowedActionAuditEventWithExecutor } from '@/lib/audit/action-audit'
import { recordSecurityEvent } from '@/lib/auth/audit'
import { CsrfError } from '@/lib/auth/csrf'
import { isHsaId } from '@/lib/auth/hsa-id'
import { getRequestSqlServerDataSource } from '@/lib/db'
import { logSanitizedError } from '@/lib/http/safe-errors'
import {
  customMutationPolicy,
  secureMutationRoute,
} from '@/lib/http/secure-mutation-route'
import {
  boundedDbStringSchema,
  optionalBoundedDbStringSchema,
} from '@/lib/http/validation'
import {
  executePrivacyErasure,
  type PrivacyErasureAction,
} from '@/lib/privacy/erasure'
import {
  assertPrivacyOfficer,
  auditActor,
  unexpectedErrorBody,
} from '@/lib/privacy/route-helpers'
import { isRequirementsServiceError } from '@/lib/requirements/errors'
import { toHttpErrorPayload } from '@/lib/requirements/http-errors'

export const dynamic = 'force-dynamic'

const hsaIdSchema = boundedDbStringSchema.refine(isHsaId, {
  message: 'HSA-ID must use format SE<10-digit org no>-<alphanumeric suffix>.',
})

const privacyErasureActionValues = [
  'anonymize',
  'delete',
  'skip',
  'switch',
] as const satisfies readonly PrivacyErasureAction[]

const actionSchema = z.enum(privacyErasureActionValues)

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

export const POST = secureMutationRoute({
  bodySchema: erasureRequestSchema,
  policy: customMutationPolicy('privacy.erasure.execute', ({ context }) => {
    assertPrivacyOfficer(context)
  }),
  handler: async ({ body, context, request }) => {
    try {
      const db = await getRequestSqlServerDataSource()
      const result = await executePrivacyErasure(db, {
        actions: body.actions,
        audit: (executor, auditResult) =>
          recordAllowedActionAuditEventWithExecutor(executor, context, {
            action: 'privacy.erasure.execute',
            details: {
              anonymizeCount: auditResult.actions.anonymize,
              deleteCount: auditResult.actions.delete,
              erasureRequestId: auditResult.requestId,
              skipCount: auditResult.actions.skip,
              switchCount: auditResult.actions.switch,
              targetFingerprint: auditResult.targetFingerprint,
              totalCount: auditResult.totalCount,
            },
            targetId: auditResult.requestId,
            targetKind: 'PrivacyErasure',
          }),
        previewToken: body.previewToken,
        replacement: body.replacement ?? null,
        target: body.target,
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
  },
})
