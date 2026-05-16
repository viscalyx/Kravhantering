import { NextResponse } from 'next/server'
import { z } from 'zod'
import {
  createArchivingRetentionException,
  deleteArchivingRetentionException,
} from '@/lib/archiving/retention'
import { recordAllowedActionAuditEventWithExecutor } from '@/lib/audit/action-audit'
import { recordSecurityEvent } from '@/lib/auth/audit'
import { CsrfError } from '@/lib/auth/csrf'
import { getRequestSqlServerDataSource } from '@/lib/db'
import { logSanitizedError } from '@/lib/http/safe-errors'
import {
  customMutationPolicy,
  secureMutationRoute,
} from '@/lib/http/secure-mutation-route'
import {
  boundedDbStringSchema,
  optionalBoundedDbStringSchema,
  positiveIntegerSchema,
} from '@/lib/http/validation'
import {
  assertPrivacyOfficer,
  auditActor,
  unexpectedErrorBody,
} from '@/lib/privacy/route-helpers'
import { requireHumanActorSnapshot } from '@/lib/requirements/auth'
import { isRequirementsServiceError } from '@/lib/requirements/errors'
import { toHttpErrorPayload } from '@/lib/requirements/http-errors'

export const dynamic = 'force-dynamic'

const archivingExceptionSchema = z
  .object({
    expiresAt: optionalBoundedDbStringSchema
      .refine(
        value =>
          value == null ||
          value === '' ||
          !Number.isNaN(new Date(value).getTime()),
        { message: 'Expected an ISO date-time string.' },
      )
      .transform(value => (value ? new Date(value) : null)),
    policyId: positiveIntegerSchema,
    reason: boundedDbStringSchema,
    sourceKey: boundedDbStringSchema,
    subjectId: boundedDbStringSchema,
    subjectTable: boundedDbStringSchema,
  })
  .strict()

const deleteArchivingExceptionSchema = z
  .object({
    id: positiveIntegerSchema,
  })
  .strict()

function noStore<T extends NextResponse>(response: T): T {
  response.headers.set('Cache-Control', 'no-store')
  return response
}

export const POST = secureMutationRoute({
  bodySchema: archivingExceptionSchema,
  decorateErrorResponse: noStore,
  policy: customMutationPolicy(
    'admin.archiving_exception.create',
    ({ context }) => {
      assertPrivacyOfficer(context)
    },
  ),
  handler: async ({ body, context, request }) => {
    try {
      const db = await getRequestSqlServerDataSource()
      const actor = requireHumanActorSnapshot(context)
      let exception!: Awaited<
        ReturnType<typeof createArchivingRetentionException>
      >
      await db.transaction(async manager => {
        const tx = manager as unknown as typeof db
        exception = await createArchivingRetentionException(tx, body, actor)
        await recordAllowedActionAuditEventWithExecutor(manager, context, {
          action: 'admin.archiving_exception.create',
          details: {
            exceptionId: exception.id,
            policyId: exception.policyId,
            sourceKey: exception.sourceKey,
            subjectTable: exception.subjectTable,
          },
          targetId: exception.id,
          targetKind: 'ArchivingRetentionException',
        })
      })
      recordSecurityEvent({
        actor: auditActor(context),
        detail: {
          exceptionId: exception.id,
          policyId: exception.policyId,
          sourceKey: exception.sourceKey,
          subjectTable: exception.subjectTable,
        },
        event: 'admin.archiving.exception.created',
        outcome: 'success',
        request: context.request ?? request,
      })
      return noStore(NextResponse.json({ exception }, { status: 201 }))
    } catch (error) {
      if (error instanceof CsrfError || isRequirementsServiceError(error)) {
        const { body: errorBody, status } = toHttpErrorPayload(error)
        return noStore(NextResponse.json(errorBody, { status }))
      }
      logSanitizedError('Failed to create archiving exception', error)
      return noStore(
        NextResponse.json(
          unexpectedErrorBody('Failed to create archiving exception', error),
          { status: 500 },
        ),
      )
    }
  },
})

export const DELETE = secureMutationRoute({
  bodySchema: deleteArchivingExceptionSchema,
  decorateErrorResponse: noStore,
  policy: customMutationPolicy(
    'admin.archiving_exception.delete',
    ({ context }) => {
      assertPrivacyOfficer(context)
    },
  ),
  handler: async ({ body, context, request }) => {
    try {
      const db = await getRequestSqlServerDataSource()
      let deleted = false
      await db.transaction(async manager => {
        const tx = manager as unknown as typeof db
        deleted = await deleteArchivingRetentionException(tx, body.id)
        await recordAllowedActionAuditEventWithExecutor(manager, context, {
          action: 'admin.archiving_exception.delete',
          details: {
            deleted,
            exceptionId: body.id,
          },
          targetId: body.id,
          targetKind: 'ArchivingRetentionException',
        })
      })
      recordSecurityEvent({
        actor: auditActor(context),
        detail: {
          deleted,
          exceptionId: body.id,
        },
        event: 'admin.archiving.exception.deleted',
        outcome: 'success',
        request: context.request ?? request,
      })
      return noStore(NextResponse.json({ deleted }))
    } catch (error) {
      if (error instanceof CsrfError || isRequirementsServiceError(error)) {
        const { body: errorBody, status } = toHttpErrorPayload(error)
        return noStore(NextResponse.json(errorBody, { status }))
      }
      logSanitizedError('Failed to delete archiving exception', error)
      return noStore(
        NextResponse.json(
          unexpectedErrorBody('Failed to delete archiving exception', error),
          { status: 500 },
        ),
      )
    }
  },
})
