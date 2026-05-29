import type { NextRequest } from 'next/server'
import { renderReportModelPdfResponse } from '@/components/reports/pdf/report-response'
import { getRequestSqlServerDataSource } from '@/lib/db'
import {
  collectMultipleRequirementsForReport,
  ReportDataError,
} from '@/lib/reports/data/server'
import { buildCombinedReviewReport } from '@/lib/reports/templates/combined-review-template'
import {
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

    const db = await getRequestSqlServerDataSource()
    const requirements = await collectMultipleRequirementsForReport(db, ids)
    const label =
      locale === 'sv'
        ? 'Kombinerad granskningsrapport'
        : 'Combined Review Report'
    return renderReportModelPdfResponse(
      buildCombinedReviewReport(requirements, locale),
      locale,
      `${label} ${timestampForFilename()}.pdf`,
    )
  } catch (error) {
    return reportErrorResponse(error)
  }
}
