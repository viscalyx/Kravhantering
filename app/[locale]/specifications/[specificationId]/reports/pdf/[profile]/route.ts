import type { NextRequest } from 'next/server'
import {
  authorizeSpecificationReportRead,
  createReportRuntime,
  type ReportRouteParams,
  reportErrorResponse,
  resolveReportSpecification,
} from '@/app/[locale]/requirements/reports/pdf/route-helpers'
import { renderReportModelPdfResponse } from '@/components/reports/pdf/report-response'
import { ReportDataError } from '@/lib/reports/data/server'
import { collectSpecificationOutputData } from '@/lib/reports/data/specification-output'
import { getReportLabels } from '@/lib/reports/report-labels'
import {
  getSpecificationReportProfileForLifecycleStatus,
  parseSpecificationReportProfile,
} from '@/lib/reports/specification-profiles'
import { buildSpecificationProfileReport } from '@/lib/reports/templates/specification-profile-template'

export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  {
    params,
  }: {
    params: ReportRouteParams<{ profile: string; specificationId: string }>
  },
) {
  const { locale, profile: rawProfile, specificationId } = await params

  try {
    const profile = parseSpecificationReportProfile(rawProfile)
    if (!profile) {
      throw new ReportDataError('Invalid report profile', 400)
    }

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

    if (
      getSpecificationReportProfileForLifecycleStatus(
        specification.specificationLifecycleStatusId,
      ) !== profile
    ) {
      throw new ReportDataError(
        'Report profile is not available for this specification lifecycle status',
        409,
      )
    }

    const data = await collectSpecificationOutputData(
      runtime.db,
      specification.id,
    )
    const labels = getReportLabels(locale).columns
    const title =
      profile === 'procurement'
        ? labels.procurementReportTitle
        : profile === 'management'
          ? labels.managementReportTitle
          : labels.progressReportTitle

    return renderReportModelPdfResponse(
      buildSpecificationProfileReport(data, profile, locale),
      locale,
      `${title} ${data.specification.name} ${data.specification.specificationCode}.pdf`,
    )
  } catch (error) {
    return reportErrorResponse(error)
  }
}
