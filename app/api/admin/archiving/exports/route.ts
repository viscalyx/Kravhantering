import { NextResponse } from 'next/server'
import { z } from 'zod'
import { exportArchivingRetentionArchive } from '@/lib/archiving/retention'
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
  positiveIntegerSchema,
} from '@/lib/http/validation'
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

function noStore<T extends NextResponse>(response: T): T {
  response.headers.set('Cache-Control', 'no-store')
  return response
}

export const POST = secureMutationRoute({
  bodySchema: archivingExportSchema,
  decorateErrorResponse: noStore,
  policy: customMutationPolicy('admin.archiving.export', ({ context }) => {
    assertPrivacyOfficer(context)
  }),
  handler: async ({ body, context, request }) => {
    try {
      const db = await getRequestSqlServerDataSource()
      const result = await exportArchivingRetentionArchive(db, body)
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
      return noStore(NextResponse.json(result))
    } catch (error) {
      if (error instanceof CsrfError || isRequirementsServiceError(error)) {
        const { body: errorBody, status } = toHttpErrorPayload(error)
        return noStore(NextResponse.json(errorBody, { status }))
      }
      logSanitizedError('Failed to export archiving retention', error)
      return noStore(
        NextResponse.json(
          unexpectedErrorBody('Failed to export archiving retention', error),
          { status: 500 },
        ),
      )
    }
  },
})
