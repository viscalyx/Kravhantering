import type { NextRequest } from 'next/server'
import { renderReportModelPdfResponse } from '@/components/reports/pdf/report-response'
import {
  getSpecificationItemById,
  parseSpecificationItemRef,
} from '@/lib/dal/requirements-specifications'
import {
  collectDeviationForReport,
  ReportDataError,
} from '@/lib/reports/data/server'
import { buildDeviationReviewReport } from '@/lib/reports/templates/deviation-review-template'
import {
  authorizeSpecificationReportRead,
  createReportRuntime,
  type ReportRouteParams,
  reportErrorResponse,
} from '../../route-helpers'

export const dynamic = 'force-dynamic'

function decodeItemRef(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function parseLibrarySpecificationItemId(value: string): number {
  const decoded = decodeItemRef(value)
  const parsed = parseSpecificationItemRef(decoded)
  if (parsed?.kind === 'specificationLocal') {
    throw new ReportDataError(
      'Deviation review PDF is only available for library requirement applications',
      400,
    )
  }

  const itemId =
    parsed?.kind === 'library'
      ? parsed.id
      : /^\d+$/.test(decoded)
        ? Number(decoded)
        : null
  if (!itemId || !Number.isInteger(itemId) || itemId < 1) {
    throw new ReportDataError('Invalid requirement application ID', 400)
  }
  return itemId
}

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
