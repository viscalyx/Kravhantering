import type { NextRequest } from 'next/server'
import {
  type ReportRouteParams,
  reportErrorResponse,
  splitCsvParam,
} from '@/app/[locale]/requirements/reports/pdf/route-helpers'
import { renderReportModelPdfResponse } from '@/components/reports/pdf/report-response'
import { getRequestSqlServerDataSource } from '@/lib/db'
import {
  collectSpecificationItemsForReport,
  ReportDataError,
} from '@/lib/reports/data/server'
import { buildListReport } from '@/lib/reports/templates/list-template'

export const dynamic = 'force-dynamic'

function pickName(
  locale: string,
  value: { nameEn: string; nameSv: string } | null,
): string | null {
  return value ? (locale === 'sv' ? value.nameSv : value.nameEn) : null
}

export async function GET(
  request: NextRequest,
  { params }: { params: ReportRouteParams<{ slug: string }> },
) {
  const { locale, slug } = await params

  try {
    const itemRefs = splitCsvParam(request.nextUrl.searchParams.get('refs'))
    if (itemRefs.length === 0) {
      throw new ReportDataError('No specification item refs provided', 400)
    }

    const db = await getRequestSqlServerDataSource()
    const { requirements, specification } =
      await collectSpecificationItemsForReport(db, slug, itemRefs)
    const label = locale === 'sv' ? 'Kravlista' : 'Requirements List'
    return renderReportModelPdfResponse(
      buildListReport(requirements, locale, {
        businessNeedsReference: specification.businessNeedsReference,
        governanceObjectType: pickName(
          locale,
          specification.governanceObjectType,
        ),
        implementationType: pickName(locale, specification.implementationType),
        lifecycleStatus: pickName(locale, specification.lifecycleStatus),
        name: specification.name,
        uniqueId: specification.uniqueId,
      }),
      locale,
      `${label} ${specification.name} ${specification.uniqueId}.pdf`,
    )
  } catch (error) {
    return reportErrorResponse(error)
  }
}
