import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSpecificationById } from '@/lib/dal/requirements-specifications'
import {
  createCsvItemLimitError,
  runBoundedCsvOutput,
} from '@/lib/generated-output/csv-runner'
import { csvContentDisposition } from '@/lib/http/content-disposition'
import {
  idParamSchema,
  localeSchema,
  parseRouteParams,
  parseSearchParams,
} from '@/lib/http/validation'
import { applyResponseCorrelationHeaders } from '@/lib/observability/request-ids'
import { ReportDataError } from '@/lib/reports/data/server'
import { visitSpecificationOutputPages } from '@/lib/reports/data/specification-output'
import { getReportLabels } from '@/lib/reports/report-labels'
import { createSpecificationCsvFormatter } from '@/lib/reports/specification-csv'
import {
  canExportProcurementCsvForLifecycleStatus,
  parseSpecificationCsvProfile,
} from '@/lib/reports/specification-profiles'
import { toHttpErrorPayload } from '@/lib/requirements/http-errors'
import { createRequirementsRestRuntime } from '@/lib/requirements/server'
import { authorize } from '@/lib/requirements/service-shared'

export const dynamic = 'force-dynamic'

type Params = Promise<{ id: string }>

const specificationParamSchema = idParamSchema

const exportQuerySchema = z
  .object({
    locale: localeSchema.optional().default('en'),
    profile: z.enum(['procurement', 'full']),
  })
  .strict()

function errorResponse(error: unknown) {
  if (error instanceof ReportDataError) {
    return NextResponse.json(
      { error: error.message },
      { headers: { 'Cache-Control': 'no-store' }, status: error.status },
    )
  }

  const { body, status } = toHttpErrorPayload(error)
  return NextResponse.json(body, {
    headers: { 'Cache-Control': 'no-store' },
    status,
  })
}

export async function GET(
  request: NextRequest,
  { params }: { params: Params },
) {
  const parsedParams = await parseRouteParams(params, specificationParamSchema)
  if (!parsedParams.ok) {
    return parsedParams.response
  }
  const parsedQuery = parseSearchParams(
    request.nextUrl.searchParams,
    exportQuerySchema,
  )
  if (!parsedQuery.ok) {
    return parsedQuery.response
  }

  const { id } = parsedParams.data
  const profile = parseSpecificationCsvProfile(parsedQuery.data.profile)
  if (!profile) {
    return NextResponse.json(
      { error: 'Invalid export profile' },
      { headers: { 'Cache-Control': 'no-store' }, status: 400 },
    )
  }

  const runtime = await createRequirementsRestRuntime(request)
  try {
    const specification = await getSpecificationById(runtime.db, id)
    if (!specification) {
      throw new ReportDataError(`Specification not found: ${id}`, 404)
    }

    await authorize(
      runtime.authorization,
      { kind: 'get_specification_items', specificationId: specification.id },
      runtime.context,
    )

    if (
      profile === 'procurement' &&
      !canExportProcurementCsvForLifecycleStatus(
        specification.specificationLifecycleStatusId,
      )
    ) {
      throw new ReportDataError(
        'Tender CSV is only available for procurement specifications',
        409,
      )
    }

    const labels = getReportLabels(parsedQuery.data.locale).columns
    const title =
      profile === 'procurement'
        ? labels.procurementCsvTitle
        : labels.fullCsvExportTitle
    const formatter = createSpecificationCsvFormatter(
      profile,
      parsedQuery.data.locale,
    )
    const response = await runBoundedCsvOutput({
      context: runtime.context,
      db: runtime.db,
      generateRows: async ({ maxItems, signal, writeRow }) => {
        await visitSpecificationOutputPages(
          runtime.db,
          specification.id,
          async pageItems => {
            for (const item of pageItems) {
              await writeRow(formatter.serializeRow(item))
            }
          },
          {
            createItemLimitError: createCsvItemLimitError,
            maxItems,
            signal,
          },
        )
      },
      headers: formatter.headers,
      operation: 'requirements.specification_csv_export',
      requestSignal: request.signal,
      responseHeaders: {
        'Content-Disposition': csvContentDisposition(
          `${title} ${specification.name} ${specification.specificationCode}.csv`,
        ),
        'Content-Type': 'text/csv; charset=utf-8',
      },
    })
    return applyResponseCorrelationHeaders(response, runtime.context)
  } catch (error) {
    return applyResponseCorrelationHeaders(
      errorResponse(error),
      runtime.context,
    )
  }
}
