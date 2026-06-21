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
import { getSpecificationReportProfileForLifecycleStatus } from '@/lib/reports/specification-profiles'
import { buildSpecificationProfileReport } from '@/lib/reports/templates/specification-profile-template'
import { toHttpErrorPayload } from '@/lib/requirements/http-errors'
import { createRequirementsRestRuntime } from '@/lib/requirements/server'
import { authorize } from '@/lib/requirements/service-shared'

export const dynamic = 'force-dynamic'

type Params = Promise<{ id: string }>

const specificationParamSchema = z
  .object({
    id: specificationIdOrSlugSchema,
  })
  .strict()

const reportOutputQuerySchema = z
  .object({
    locale: localeSchema.optional().default('en'),
    profile: z.enum(['procurement', 'progress', 'management']),
  })
  .strict()

async function resolveSpecification(
  runtime: Awaited<ReturnType<typeof createRequirementsRestRuntime>>,
  id: string,
) {
  return /^\d+$/.test(id)
    ? getSpecificationById(runtime.db, Number(id))
    : getSpecificationBySlug(runtime.db, id)
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
    reportOutputQuerySchema,
  )
  if (!parsedQuery.ok) {
    return parsedQuery.response
  }

  const { id } = parsedParams.data
  const { profile } = parsedQuery.data

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
      getSpecificationReportProfileForLifecycleStatus(
        specification.specificationLifecycleStatusId,
      ) !== profile
    ) {
      throw new ReportDataError(
        'Report profile is not available for this specification lifecycle status',
        409,
      )
    }

    const data = await collectSpecificationOutputData(runtime.db, id)
    const response = NextResponse.json(
      buildSpecificationProfileReport(data, profile, parsedQuery.data.locale),
      { headers: { 'Cache-Control': 'no-store' } },
    )
    return applyResponseCorrelationHeaders(response, runtime.context)
  } catch (error) {
    return applyResponseCorrelationHeaders(
      errorResponse(error),
      runtime.context,
    )
  }
}
