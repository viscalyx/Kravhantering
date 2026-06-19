import type { NextRequest } from 'next/server'
import { renderReportModelPdfResponse } from '@/components/reports/pdf/report-response'
import { collectRequirementForReport } from '@/lib/reports/data/server'
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
  _request: NextRequest,
  { params }: { params: ReportRouteParams<{ id: string }> },
) {
  const { id, locale } = await params

  try {
    const runtime = await createReportRuntime(_request)
    await authorizeRequirementReportRead(
      runtime.authorization,
      runtime.context,
      id,
      'history',
    )
    const requirement = await collectRequirementForReport(runtime.db, id)
    const label = getReportLabels(locale).filenames.review
    return renderReportModelPdfResponse(
      buildReviewReport(requirement, locale),
      locale,
      `${label} ${requirement.uniqueId}.pdf`,
    )
  } catch (error) {
    return reportErrorResponse(error)
  }
}
