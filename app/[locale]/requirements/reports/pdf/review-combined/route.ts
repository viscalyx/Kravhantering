import type { NextRequest } from 'next/server'
import { renderReportModelPdfResponse } from '@/components/reports/pdf/report-response'
import {
  assertPdfItemLimit,
  runSynchronousPdfGeneration,
} from '@/lib/pdf/synchronous-generation'
import {
  collectMultipleRequirementsForReport,
  ReportDataError,
} from '@/lib/reports/data/server'
import { getReportLabels } from '@/lib/reports/report-labels'
import { buildCombinedReviewReport } from '@/lib/reports/templates/combined-review-template'
import {
  authorizeRequirementReportRead,
  createReportRuntime,
  type ReportRouteParams,
  reportErrorResponse,
  splitCsvParam,
  timestampForFilename,
} from '../route-helpers'

export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  { params }: { params: ReportRouteParams },
) {
  const { locale } = await params

  try {
    const ids = splitCsvParam(request.nextUrl.searchParams.get('ids'))
    if (ids.length === 0) {
      throw new ReportDataError('No requirement IDs provided', 400)
    }

    const runtime = await createReportRuntime(request)
    const uniqueIds = [...new Set(ids)]
    return await runSynchronousPdfGeneration(
      runtime.db,
      request.signal,
      async ({ capacity, itemLimit }) => {
        assertPdfItemLimit(uniqueIds.length, itemLimit)
        for (const id of uniqueIds) {
          await authorizeRequirementReportRead(
            runtime.authorization,
            runtime.context,
            id,
            'history',
          )
        }
        const requirements = await collectMultipleRequirementsForReport(
          runtime.db,
          uniqueIds,
        )
        const label = getReportLabels(locale).filenames.combinedReview
        return renderReportModelPdfResponse(
          buildCombinedReviewReport(requirements, locale),
          locale,
          `${label} ${timestampForFilename()}.pdf`,
          capacity,
        )
      },
    )
  } catch (error) {
    return reportErrorResponse(error)
  }
}
