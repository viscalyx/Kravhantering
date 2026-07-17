import type { NextRequest } from 'next/server'
import {
  authorizeSpecificationReportRead,
  createReportRuntime,
  type ReportRouteParams,
  reportErrorResponse,
  resolveReportSpecification,
} from '@/app/[locale]/requirements/reports/pdf/route-helpers'
import { renderReportModelPdfResponse } from '@/components/reports/pdf/report-response'
import { parseSearchParams } from '@/lib/http/validation'
import { collectSpecificationTraceabilityData } from '@/lib/reports/data/specification-traceability'
import { getReportLabels } from '@/lib/reports/report-labels'
import { buildSpecificationTraceabilityReport } from '@/lib/reports/templates/specification-traceability-template'
import { specificationItemQueryStateSchema } from '@/lib/requirements/specification-item-query'

export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  { params }: { params: ReportRouteParams<{ specificationId: string }> },
) {
  const { locale, specificationId } = await params

  try {
    const queryParams = new URLSearchParams(request.nextUrl.searchParams)
    if (!queryParams.has('locale')) queryParams.set('locale', locale)
    const parsedQuery = parseSearchParams(
      queryParams,
      specificationItemQueryStateSchema,
    )
    if (!parsedQuery.ok) return parsedQuery.response
    const runtime = await createReportRuntime(request)
    const specification = await resolveReportSpecification(
      runtime.db,
      specificationId,
    )

    await authorizeSpecificationReportRead(
      runtime.authorization,
      runtime.context,
      specification.id,
    )

    const data = await collectSpecificationTraceabilityData(
      runtime.db,
      specification,
      parsedQuery.data,
    )
    const label = getReportLabels(locale).filenames.traceability
    return renderReportModelPdfResponse(
      buildSpecificationTraceabilityReport(data, locale),
      locale,
      `${label} ${data.specification.name} ${data.specification.specificationCode}.pdf`,
    )
  } catch (error) {
    return reportErrorResponse(error)
  }
}
