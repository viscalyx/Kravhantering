import type { NextRequest } from 'next/server'
import { renderReportModelPdfResponse } from '@/components/reports/pdf/report-response'
import { getRequestSqlServerDataSource } from '@/lib/db'
import {
  collectDeviationForReport,
  ReportDataError,
} from '@/lib/reports/data/server'
import { buildDeviationReviewReport } from '@/lib/reports/templates/deviation-review-template'
import {
  type ReportRouteParams,
  reportErrorResponse,
} from '../../route-helpers'

export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  { params }: { params: ReportRouteParams<{ id: string }> },
) {
  const { id, locale } = await params
  const item = request.nextUrl.searchParams.get('item')

  try {
    if (!item) {
      throw new ReportDataError('Missing item ID in URL', 400)
    }

    const db = await getRequestSqlServerDataSource()
    const data = await collectDeviationForReport(db, id, item, locale)
    const label =
      locale === 'sv' ? 'Granskningsrapport avsteg' : 'Deviation Review Report'
    return renderReportModelPdfResponse(
      buildDeviationReviewReport(data, locale),
      locale,
      `${label} ${data.requirementUniqueId}.pdf`,
    )
  } catch (error) {
    return reportErrorResponse(error)
  }
}
