import { NextResponse } from 'next/server'
import { z } from 'zod'
import { exportArchivingRetentionArchive } from '@/lib/archiving/retention'
import { recordSecurityEvent } from '@/lib/auth/audit'
import { CsrfError } from '@/lib/auth/csrf'
import { getRequestSqlServerDataSource } from '@/lib/db'
import { runBoundedStructuredOutput } from '@/lib/generated-output/structured-runner'
import { logSanitizedError } from '@/lib/http/safe-errors'
import {
  customMutationPolicy,
  secureMutationRoute,
} from '@/lib/http/secure-mutation-route'
import {
  boundedDbStringSchema,
  positiveIntegerSchema,
} from '@/lib/http/validation'
import { synchronousGeneratedOutputErrorResponse } from '@/lib/pdf/synchronous-generation'
import {
  assertPrivacyOfficer,
  auditActor,
  unexpectedErrorBody,
} from '@/lib/privacy/route-helpers'
import { isRequirementsServiceError } from '@/lib/requirements/errors'
import { toHttpErrorPayload } from '@/lib/requirements/http-errors'

export const dynamic = 'force-dynamic'

const archivingExportSchema = z
  .object({
    policyId: positiveIntegerSchema,
    previewToken: boundedDbStringSchema,
  })
  .strict()

export const POST = secureMutationRoute({
  bodySchema: archivingExportSchema,
  policy: customMutationPolicy('admin.archiving.export', ({ context }) => {
    assertPrivacyOfficer(context)
  }),
  handler: async ({ body, context, request }) => {
    try {
      const db = await getRequestSqlServerDataSource()
      return await runBoundedStructuredOutput({
        db,
        context,
        output: 'json',
        requestSignal: request.signal,
        collect: async ({ transaction }) => {
          const result = await exportArchivingRetentionArchive(
            { transaction },
            body,
          )
          recordSecurityEvent({
            actor: auditActor(context),
            detail: {
              exportTokenFingerprint: result.exportToken.slice(0, 16),
              policyId: body.policyId,
            },
            event: 'admin.archiving.exported',
            outcome: 'success',
            request: context.request ?? request,
          })
          return result
        },
      })
    } catch (error) {
      const generatedError = synchronousGeneratedOutputErrorResponse(
        'json',
        error,
      )
      if (generatedError) return generatedError
      if (error instanceof CsrfError || isRequirementsServiceError(error)) {
        const { body: errorBody, status } = toHttpErrorPayload(error)
        return NextResponse.json(errorBody, { status })
      }
      logSanitizedError('Failed to export archiving retention', error)
      return NextResponse.json(
        unexpectedErrorBody('Failed to export archiving retention', error),
        { status: 500 },
      )
    }
  },
})
