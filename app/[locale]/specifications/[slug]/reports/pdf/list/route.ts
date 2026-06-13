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
  listSpecificationRequirementSelectionQuestions,
  resolveSpecificationId,
} from '@/lib/dal/requirement-selection-questions'
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

function buildSelectionContext(
  questions: Awaited<
    ReturnType<typeof listSpecificationRequirementSelectionQuestions>
  >,
) {
  return questions.flatMap(question =>
    question.savedAnswers.map(saved => ({
      answerText:
        question.answers.find(answer => answer.id === saved.answerId)?.text ??
        String(saved.answerId),
      areaName: question.areaName,
      changedAt: saved.updatedAt,
      isHistorical: saved.isHistorical,
      questionCode: question.questionCode,
      questionText: question.text,
      selectedByDisplayName: saved.selectedByDisplayName,
    })),
  )
}

export async function GET(
  request: NextRequest,
  { params }: { params: ReportRouteParams<{ slug: string }> },
) {
  const { locale, slug } = await params

  try {
    const itemRefs = splitCsvParam(request.nextUrl.searchParams.get('refs'))
    if (itemRefs.length === 0) {
      throw new ReportDataError('No requirement application refs provided', 400)
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
    const { requirements, specification } =
      await collectSpecificationItemsForReport(runtime.db, slug, itemRefs)
    const selectionContext = buildSelectionContext(
      await listSpecificationRequirementSelectionQuestions(
        runtime.db,
        specificationId,
      ),
    )
    const label = locale === 'sv' ? 'Kravlista' : 'Requirements List'
    return renderReportModelPdfResponse(
      buildListReport(
        requirements,
        locale,
        {
          businessNeedsReference: specification.businessNeedsReference,
          governanceObjectType: pickName(
            locale,
            specification.governanceObjectType,
          ),
          implementationType: pickName(
            locale,
            specification.implementationType,
          ),
          lifecycleStatus: pickName(locale, specification.lifecycleStatus),
          name: specification.name,
          uniqueId: specification.uniqueId,
        },
        selectionContext,
      ),
      locale,
      `${label} ${specification.name} ${specification.uniqueId}.pdf`,
    )
  } catch (error) {
    return reportErrorResponse(error)
  }
}
