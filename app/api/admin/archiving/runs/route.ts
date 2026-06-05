import { NextResponse } from 'next/server'
import { z } from 'zod'
import { executeArchivingRetention } from '@/lib/archiving/retention'
import { recordAllowedActionAuditEventWithExecutor } from '@/lib/audit/action-audit'
import { recordRequirementSelectionCleanupAudit } from '@/lib/audit/requirement-selection-cleanup-audit'
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

const archivingRunSchema = z
  .object({
    exportToken: optionalBoundedDbStringSchema,
    policyId: positiveIntegerSchema,
    previewToken: boundedDbStringSchema,
  })
  .strict()

function noStore<T extends NextResponse>(response: T): T {
  response.headers.set('Cache-Control', 'no-store')
  return response
}

export const POST = secureMutationRoute({
  bodySchema: archivingRunSchema,
  decorateErrorResponse: noStore,
  policy: customMutationPolicy('admin.archiving.execute', ({ context }) => {
    assertPrivacyOfficer(context)
  }),
  handler: async ({ body, context, request }) => {
    try {
      const db = await getRequestSqlServerDataSource()
      const actor = requireHumanActorSnapshot(context)
      const result = await executeArchivingRetention(
        db,
        {
          ...body,
          audit: (executor, auditResult) =>
            recordAllowedActionAuditEventWithExecutor(executor, context, {
              action: 'admin.archiving.execute',
              details: {
                archiveCount: auditResult.summary.archiveCount,
                candidateCount: auditResult.summary.candidateCount,
                deleteCount: auditResult.summary.deleteCount,
                exceptionCount: auditResult.summary.exceptionCount,
                policyId: body.policyId,
                runRequestId: auditResult.runRequestId,
                skippedCount: auditResult.summary.skippedCount,
              },
              targetId: auditResult.runId,
              targetKind: 'ArchivingRetentionRun',
            }),
          cleanupAudit: (executor, cleanupResult) =>
            recordRequirementSelectionCleanupAudit(executor, context, {
              cleanup: cleanupResult.cleanup,
              originAction: 'admin.archiving.execute',
              originTargetId: cleanupResult.candidate.subjectId,
              originTargetKind: cleanupResult.candidate.subjectTable,
            }),
        },
        actor,
      )
      recordSecurityEvent({
        actor: auditActor(context),
        detail: {
          archiveCount: result.summary.archiveCount,
          candidateCount: result.summary.candidateCount,
          deleteCount: result.summary.deleteCount,
          exceptionCount: result.summary.exceptionCount,
          policyKey: result.policy.policyKey,
          retentionRunId: result.runId,
          runRequestId: result.runRequestId,
          skippedCount: result.summary.skippedCount,
        },
        event: 'admin.archiving.executed',
        outcome: 'success',
        request: context.request ?? request,
      })
      return noStore(NextResponse.json(result, { status: 201 }))
    } catch (error) {
      if (error instanceof CsrfError || isRequirementsServiceError(error)) {
        const { body: errorBody, status } = toHttpErrorPayload(error)
        return noStore(NextResponse.json(errorBody, { status }))
      }
      logSanitizedError('Failed to execute archiving retention', error)
      return noStore(
        NextResponse.json(
          unexpectedErrorBody('Failed to execute archiving retention', error),
          { status: 500 },
        ),
      )
    }
  },
})
