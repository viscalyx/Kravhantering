import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  getSpecificationById,
  getSpecificationBySlug,
} from '@/lib/dal/requirements-specifications'
import {
  localeSchema,
  parseRouteParams,
  parseSearchParams,
  specificationIdOrSlugSchema,
} from '@/lib/http/validation'
import { applyResponseCorrelationHeaders } from '@/lib/observability/request-ids'
import { ReportDataError } from '@/lib/reports/data/server'
import { collectSpecificationOutputData } from '@/lib/reports/data/specification-output'
import { getReportLabels } from '@/lib/reports/report-labels'
import { buildSpecificationCsv } from '@/lib/reports/specification-csv'
import {
  canExportProcurementCsvForLifecycleStatus,
  parseSpecificationCsvProfile,
} from '@/lib/reports/specification-profiles'
import { toHttpErrorPayload } from '@/lib/requirements/http-errors'
import { createRequirementsRestRuntime } from '@/lib/requirements/server'
import { authorize } from '@/lib/requirements/service-shared'
import { withUtf8Bom } from '@/lib/text-export'

export const dynamic = 'force-dynamic'

type Params = Promise<{ id: string }>

const specificationParamSchema = z
  .object({
    id: specificationIdOrSlugSchema,
  })
  .strict()

const exportQuerySchema = z
  .object({
    locale: localeSchema.optional().default('en'),
    profile: z.enum(['procurement', 'full']),
  })
  .strict()

const RESERVED_FILENAME_CHARS = /[/\\:*?"<>|]+/g

async function resolveSpecification(
  runtime: Awaited<ReturnType<typeof createRequirementsRestRuntime>>,
  id: string,
) {
  return /^\d+$/.test(id)
    ? getSpecificationById(runtime.db, Number(id))
    : getSpecificationBySlug(runtime.db, id)
}

function csvContentDisposition(filename: string): string {
  const sanitized = filename
    .replace(RESERVED_FILENAME_CHARS, '-')
    .replace(/\s+/g, ' ')
    .trim()
  const withExtension = sanitized.toLowerCase().endsWith('.csv')
    ? sanitized
    : `${sanitized}.csv`
  const fallback = withExtension.replace(/[^\x20-\x7e]/g, '_')

  return `attachment; filename="${fallback.replace(/"/g, '\\"')}"; filename*=UTF-8''${encodeURIComponent(withExtension)}`
}

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
    const specification = await resolveSpecification(runtime, id)
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

    const data = await collectSpecificationOutputData(runtime.db, id)
    const labels = getReportLabels(parsedQuery.data.locale).columns
    const title =
      profile === 'procurement'
        ? labels.procurementCsvTitle
        : labels.fullCsvExportTitle
    const response = new NextResponse(
      withUtf8Bom(
        buildSpecificationCsv(data, profile, parsedQuery.data.locale),
      ),
      {
        headers: {
          'Cache-Control': 'no-store',
          'Content-Disposition': csvContentDisposition(
            `${title} ${specification.name} ${specification.uniqueId}.csv`,
          ),
          'Content-Type': 'text/csv; charset=utf-8',
        },
      },
    )
    return applyResponseCorrelationHeaders(response, runtime.context)
  } catch (error) {
    return applyResponseCorrelationHeaders(
      errorResponse(error),
      runtime.context,
    )
  }
}
