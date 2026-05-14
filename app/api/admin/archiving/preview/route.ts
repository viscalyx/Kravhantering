import { NextResponse } from 'next/server'
import { z } from 'zod'
import { previewArchivingRetention } from '@/lib/archiving/retention'
import { recordSecurityEvent } from '@/lib/auth/audit'
import { CsrfError } from '@/lib/auth/csrf'
import { getRequestSqlServerDataSource } from '@/lib/db'
import { logSanitizedError } from '@/lib/http/safe-errors'
import {
  customMutationPolicy,
  secureMutationRoute,
} from '@/lib/http/secure-mutation-route'
import { positiveIntegerSchema } from '@/lib/http/validation'
import {
  assertPrivacyOfficer,
  auditActor,
  unexpectedErrorBody,
} from '@/lib/privacy/route-helpers'
import { isRequirementsServiceError } from '@/lib/requirements/errors'
import { toHttpErrorPayload } from '@/lib/requirements/http-errors'

export const dynamic = 'force-dynamic'

const archivingPreviewSchema = z
  .object({
    policyId: positiveIntegerSchema,
  })
  .strict()

function noStore<T extends NextResponse>(response: T): T {
  response.headers.set('Cache-Control', 'no-store')
  return response
}

export const POST = secureMutationRoute({
  bodySchema: archivingPreviewSchema,
  decorateErrorResponse: noStore,
  policy: customMutationPolicy('admin.archiving.preview', ({ context }) => {
    assertPrivacyOfficer(context)
  }),
  handler: async ({ body, context, request }) => {
    try {
      const db = await getRequestSqlServerDataSource()
      const preview = await previewArchivingRetention(db, {
        policyId: body.policyId,
      })
      recordSecurityEvent({
        actor: auditActor(context),
        detail: {
          archiveCount: preview.summary.archiveCount,
          candidateCount: preview.summary.candidateCount,
          deleteCount: preview.summary.deleteCount,
          exceptionCount: preview.summary.exceptionCount,
          policyKey: preview.policy.policyKey,
        },
        event: 'admin.archiving.previewed',
        outcome: 'success',
        request: context.request ?? request,
      })
      return noStore(NextResponse.json(preview))
    } catch (error) {
      if (error instanceof CsrfError || isRequirementsServiceError(error)) {
        const { body: errorBody, status } = toHttpErrorPayload(error)
        return noStore(NextResponse.json(errorBody, { status }))
      }
      logSanitizedError('Failed to preview archiving retention', error)
      return noStore(
        NextResponse.json(
          unexpectedErrorBody('Failed to preview archiving retention', error),
          { status: 500 },
        ),
      )
    }
  },
})
