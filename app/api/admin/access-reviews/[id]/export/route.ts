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
import {
  accessReviewErrorResponse,
  addNoStore,
} from '@/lib/access-review/route-helpers'
import { buildAccessReviewExport } from '@/lib/access-review/service'
import { recordSecurityEvent } from '@/lib/auth/audit'
import { getRequestSqlServerDataSource } from '@/lib/db'
import {
  customMutationPolicy,
  secureMutationRoute,
} from '@/lib/http/secure-mutation-route'
import { idParamSchema, localeSchema } from '@/lib/http/validation'
import { renderPdfResponse } from '@/lib/pdf/server-response'

export const dynamic = 'force-dynamic'

const exportSchema = z
  .object({
    delivery: z.union([z.literal('json'), z.literal('pdf')]),
    locale: localeSchema.optional().default('sv'),
  })
  .strict()

export const POST = secureMutationRoute({
  bodySchema: exportSchema,
  decorateErrorResponse: addNoStore,
  paramsSchema: idParamSchema,
  policy: customMutationPolicy('access_review.export', () => {}),
  handler: async ({ body, context, params, request }) => {
    try {
      const db = await getRequestSqlServerDataSource()
      const exportPayload = await buildAccessReviewExport(
        db,
        params.id,
        accessReviewServiceActor(context),
      )
      recordSecurityEvent({
        actor: accessReviewAuditActor(context),
        detail: {
          delivery: body.delivery,
          itemCount: exportPayload.run.summary.itemCount,
          reviewId: params.id,
          status: exportPayload.run.status,
        },
        event: 'access_review.exported',
        outcome: 'success',
        request: context.request ?? request,
      })
      if (body.delivery === 'pdf') {
        return renderPdfResponse(
          createElement(AccessReviewExportPdfRenderer, {
            exportData: exportPayload,
            locale: body.locale,
          }),
          accessReviewExportFilename(exportPayload, 'pdf', body.locale),
        )
      }
      return NextResponse.json(exportPayload, {
        headers: { 'Cache-Control': 'no-store' },
      })
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
      return accessReviewErrorResponse(
        'Failed to export access review',
        error,
        {
          noStore: true,
        },
      )
    }
  },
})
