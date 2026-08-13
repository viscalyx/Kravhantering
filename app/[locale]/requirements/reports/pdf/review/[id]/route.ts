import type { NextRequest } from 'next/server'
import { renderReportModelPdfResponse } from '@/components/reports/pdf/report-response'
import {
  createPdfItemLimitError,
  runSynchronousPdfGeneration,
} from '@/lib/pdf/synchronous-generation'
import {
  assertRequirementReportItemLimit,
  collectRequirementForReport,
} from '@/lib/reports/data/server'
import { getReportLabels } from '@/lib/reports/report-labels'
import { buildReviewReport } from '@/lib/reports/templates/review-template'
import {
  authorizeRequirementReportRead,
  createReportRuntime,
  type ReportRouteParams,
  reportErrorResponse,
} from '../../route-helpers'

export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  { params }: { params: ReportRouteParams<{ id: string }> },
) {
  const { id, locale } = await params

  try {
    const runtime = await createReportRuntime(request)
    await authorizeRequirementReportRead(
      runtime.authorization,
      runtime.context,
      id,
      'history',
    )
    return await runSynchronousPdfGeneration(
      runtime.db,
      request.signal,
      async ({ capacity, itemLimit }) => {
        await assertRequirementReportItemLimit(runtime.db, id, {
          collection: 'versions',
          createItemLimitError: createPdfItemLimitError,
          maxItems: itemLimit,
        })
        const requirement = await collectRequirementForReport(runtime.db, id)
        const label = getReportLabels(locale).filenames.review
        return renderReportModelPdfResponse(
          buildReviewReport(requirement, locale),
          locale,
          `${label} ${requirement.uniqueId}.pdf`,
          capacity,
        )
      },
    )
  } catch (error) {
    return reportErrorResponse(error)
  }
}
