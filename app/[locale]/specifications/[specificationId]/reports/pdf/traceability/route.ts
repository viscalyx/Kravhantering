import type { NextRequest } from 'next/server'
import {
  authorizeSpecificationReportRead,
  createReportRuntime,
  type ReportRouteParams,
  reportErrorResponse,
  splitCsvParam,
} from '@/app/[locale]/requirements/reports/pdf/route-helpers'
import { renderReportModelPdfResponse } from '@/components/reports/pdf/report-response'
import {
  getSpecificationById,
  parseSpecificationItemRef,
  type SpecificationItemRef,
} from '@/lib/dal/requirements-specifications'
import { ARRAY_INPUT_MAX_ITEMS } from '@/lib/http/validation'
import { ReportDataError } from '@/lib/reports/data/server'
import { collectSpecificationTraceabilityData } from '@/lib/reports/data/specification-traceability'
import { getReportLabels } from '@/lib/reports/report-labels'
import { buildSpecificationTraceabilityReport } from '@/lib/reports/templates/specification-traceability-template'

export const dynamic = 'force-dynamic'

function validateItemRefs(refs: string[]): SpecificationItemRef[] {
  if (refs.length === 0) {
    throw new ReportDataError('No item refs provided', 400)
  }
  if (refs.length > ARRAY_INPUT_MAX_ITEMS) {
    throw new ReportDataError('Too many item refs provided', 400)
  }
  if (new Set(refs).size !== refs.length) {
    throw new ReportDataError('Expected unique item references', 400)
  }
  for (const ref of refs) {
    if (!/^(lib|local):[1-9]\d*$/.test(ref)) {
      throw new ReportDataError('Invalid item ref', 400)
    }
    if (!parseSpecificationItemRef(ref)) {
      throw new ReportDataError('Invalid item ref', 400)
    }
  }
  return refs as SpecificationItemRef[]
}

export async function GET(
  request: NextRequest,
  { params }: { params: ReportRouteParams<{ specificationId: string }> },
) {
  const { locale, specificationId } = await params

  try {
    const itemRefs = validateItemRefs(
      splitCsvParam(request.nextUrl.searchParams.get('refs')),
    )
    if (!/^\d+$/.test(specificationId)) {
      throw new ReportDataError(
        `Specification not found: ${specificationId}`,
        404,
      )
    }
    const runtime = await createReportRuntime(request)
    const specification = await getSpecificationById(
      runtime.db,
      Number(specificationId),
    )
    if (!specification) {
      throw new ReportDataError(
        `Specification not found: ${specificationId}`,
        404,
      )
    }

    await authorizeSpecificationReportRead(
      runtime.authorization,
      runtime.context,
      specification.id,
    )

    const data = await collectSpecificationTraceabilityData(
      runtime.db,
      specification,
      itemRefs,
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
