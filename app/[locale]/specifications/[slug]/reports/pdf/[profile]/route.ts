import type { NextRequest } from 'next/server'
import {
  authorizeSpecificationReportRead,
  createReportRuntime,
  type ReportRouteParams,
  reportErrorResponse,
} from '@/app/[locale]/requirements/reports/pdf/route-helpers'
import { renderReportModelPdfResponse } from '@/components/reports/pdf/report-response'
import { resolveSpecificationId } from '@/lib/dal/requirement-selection-questions'
import { getSpecificationBySlug } from '@/lib/dal/requirements-specifications'
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
  { params }: { params: ReportRouteParams<{ profile: string; slug: string }> },
) {
  const { locale, profile: rawProfile, slug } = await params

  try {
    const profile = parseSpecificationReportProfile(rawProfile)
    if (!profile) {
      throw new ReportDataError('Invalid report profile', 400)
    }

    const runtime = await createReportRuntime(request)
    const specificationId = await resolveSpecificationId(runtime.db, slug)
    if (!specificationId) {
      throw new ReportDataError(`Specification not found: ${slug}`, 404)
    }

    await authorizeSpecificationReportRead(
      runtime.authorization,
      runtime.context,
      specificationId,
    )

    const specification = await getSpecificationBySlug(runtime.db, slug)
    if (!specification) {
      throw new ReportDataError(`Specification not found: ${slug}`, 404)
    }

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

    const data = await collectSpecificationOutputData(runtime.db, slug)
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
      `${title} ${data.specification.name} ${data.specification.uniqueId}.pdf`,
    )
  } catch (error) {
    return reportErrorResponse(error)
  }
}
