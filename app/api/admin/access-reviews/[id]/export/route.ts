import { NextResponse } from 'next/server'
import { createElement } from 'react'
import { z } from 'zod'
import AccessReviewExportPdfRenderer from '@/components/access-review/AccessReviewExportPdfRenderer'
import { accessReviewExportFilename } from '@/lib/access-review/export-filenames'
import {
  accessReviewAuditActor,
  accessReviewServiceActor,
  recordAccessReviewAuthorizationDenied,
} from '@/lib/access-review/route-audit'
import { accessReviewErrorResponse } from '@/lib/access-review/route-helpers'
import {
  buildAccessReviewExport,
  requireAccessReviewRole,
} from '@/lib/access-review/service'
import { recordSecurityEvent } from '@/lib/auth/audit'
import { getRequestSqlServerDataSource } from '@/lib/db'
import { throwIfGenerationAborted } from '@/lib/generated-output/operation'
import {
  customMutationPolicy,
  secureMutationRoute,
} from '@/lib/http/secure-mutation-route'
import { idParamSchema, localeSchema } from '@/lib/http/validation'
import { renderPdfResponse } from '@/lib/pdf/server-response'
import {
  createPdfItemLimitError,
  runSynchronousPdfGeneration,
  synchronousPdfErrorResponse,
} from '@/lib/pdf/synchronous-generation'

export const dynamic = 'force-dynamic'

const exportSchema = z
  .object({
    delivery: z.union([z.literal('json'), z.literal('pdf')]),
    locale: localeSchema.optional().default('sv'),
  })
  .strict()

export const POST = secureMutationRoute({
  bodySchema: exportSchema,
  paramsSchema: idParamSchema,
  policy: customMutationPolicy('access_review.export', () => {}),
  handler: async ({ body, context, params, request }) => {
    try {
      const actor = accessReviewServiceActor(context)
      requireAccessReviewRole(actor)
      const db = await getRequestSqlServerDataSource()
      if (body.delivery === 'pdf') {
        return await runSynchronousPdfGeneration(
          db,
          request.signal,
          async ({ capacity, itemLimit, signal }) => {
            const exportPayload = await buildAccessReviewExport(
              db,
              params.id,
              actor,
              new Date(),
              {
                createItemLimitError: createPdfItemLimitError,
                maxItems: itemLimit,
              },
            )
            const response = await renderPdfResponse(
              createElement(AccessReviewExportPdfRenderer, {
                exportData: exportPayload,
                locale: body.locale,
              }),
              accessReviewExportFilename(exportPayload, 'pdf', body.locale),
              { capacity },
            )
            throwIfGenerationAborted(signal)
            recordExportSecurityEvent(
              body.delivery,
              exportPayload,
              params.id,
              context,
              request,
            )
            return response
          },
        )
      }
      const exportPayload = await buildAccessReviewExport(db, params.id, actor)
      recordExportSecurityEvent(
        body.delivery,
        exportPayload,
        params.id,
        context,
        request,
      )
      return NextResponse.json(exportPayload)
    } catch (error) {
      await recordAccessReviewAuthorizationDenied(
        context,
        request,
        {
          actionKind: 'access_review.export',
          delivery: body.delivery,
          reviewId: params.id,
        },
        error,
      )
      return (
        synchronousPdfErrorResponse(error) ??
        accessReviewErrorResponse('Failed to export access review', error)
      )
    }
  },
})

function recordExportSecurityEvent(
  delivery: 'json' | 'pdf',
  exportPayload: Awaited<ReturnType<typeof buildAccessReviewExport>>,
  reviewId: number,
  context: Parameters<typeof accessReviewAuditActor>[0],
  request: Request,
): void {
  recordSecurityEvent({
    actor: accessReviewAuditActor(context),
    detail: {
      delivery,
      itemCount: exportPayload.run.summary.itemCount,
      reviewId,
      status: exportPayload.run.status,
    },
    event: 'access_review.exported',
    outcome: 'success',
    request: context.request ?? request,
  })
}
