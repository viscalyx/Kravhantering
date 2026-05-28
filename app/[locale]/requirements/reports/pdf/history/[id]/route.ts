import type { NextRequest } from 'next/server'
import { renderReportModelPdfResponse } from '@/components/reports/pdf/report-response'
import { getRequestSqlServerDataSource } from '@/lib/db'
import { collectRequirementForReport } from '@/lib/reports/data/server'
import { buildHistoryReport } from '@/lib/reports/templates/history-template'
import {
  type ReportRouteParams,
  reportErrorResponse,
} from '../../route-helpers'

export const dynamic = 'force-dynamic'

export async function GET(
  _request: NextRequest,
  { params }: { params: ReportRouteParams<{ id: string }> },
) {
  const { id, locale } = await params

  try {
    const db = await getRequestSqlServerDataSource()
    const requirement = await collectRequirementForReport(db, id)
    const label = locale === 'sv' ? 'Historikrapport' : 'History Report'
    return renderReportModelPdfResponse(
      buildHistoryReport(requirement, locale),
      locale,
      `${label} ${requirement.uniqueId}.pdf`,
    )
  } catch (error) {
    return reportErrorResponse(error)
  }
}
