import type { NextRequest } from 'next/server'
import { renderReportModelPdfResponse } from '@/components/reports/pdf/report-response'
import { getRequestSqlServerDataSource } from '@/lib/db'
import {
  collectRequirementForReport,
  collectSuggestionsForReport,
} from '@/lib/reports/data/server'
import { buildSuggestionHistoryReport } from '@/lib/reports/templates/suggestion-history-template'
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
    const [requirement, suggestions] = await Promise.all([
      collectRequirementForReport(db, id),
      collectSuggestionsForReport(db, id),
    ])
    const label =
      locale === 'sv'
        ? 'Andringsforslagshistorik'
        : 'Improvement Suggestion History'
    return renderReportModelPdfResponse(
      buildSuggestionHistoryReport(requirement, suggestions, locale),
      locale,
      `${label} ${requirement.uniqueId}.pdf`,
    )
  } catch (error) {
    return reportErrorResponse(error)
  }
}
