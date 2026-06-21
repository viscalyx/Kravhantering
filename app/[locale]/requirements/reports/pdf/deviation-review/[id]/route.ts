import type { NextRequest } from 'next/server'
import { renderReportModelPdfResponse } from '@/components/reports/pdf/report-response'
import { getSpecificationItemById } from '@/lib/dal/requirements-specifications'
import {
  collectDeviationForReport,
  parseLibrarySpecificationItemId,
  ReportDataError,
} from '@/lib/reports/data/server'
import { getReportLabels } from '@/lib/reports/report-labels'
import { buildDeviationReviewReport } from '@/lib/reports/templates/deviation-review-template'
import {
  authorizeSpecificationReportRead,
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
  const item = request.nextUrl.searchParams.get('item')

  try {
    if (!item) {
      throw new ReportDataError('Missing item ID in URL', 400)
    }

    const runtime = await createReportRuntime(request)
    const specificationItemId = parseLibrarySpecificationItemId(item)
    const specificationItem = await getSpecificationItemById(
      runtime.db,
      specificationItemId,
    )
    if (!specificationItem) {
      throw new ReportDataError(`Item not found: ${item}`, 404)
    }
    await authorizeSpecificationReportRead(
      runtime.authorization,
      runtime.context,
      specificationItem.specificationId,
    )
    const data = await collectDeviationForReport(runtime.db, id, item, locale)
    const label = getReportLabels(locale).filenames.deviationReview
    return renderReportModelPdfResponse(
      buildDeviationReviewReport(data, locale),
      locale,
      `${label} ${data.requirementUniqueId}.pdf`,
    )
  } catch (error) {
    return reportErrorResponse(error)
  }
}
