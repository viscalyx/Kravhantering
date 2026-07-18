import { type NextRequest, NextResponse } from 'next/server'
import { getSpecificationById } from '@/lib/dal/requirements-specifications'
import {
  idParamSchema,
  parseRouteParams,
  parseSearchParams,
} from '@/lib/http/validation'
import { applyResponseCorrelationHeaders } from '@/lib/observability/request-ids'
import { ReportDataError } from '@/lib/reports/data/server'
import { collectSpecificationTraceabilityData } from '@/lib/reports/data/specification-traceability'
import { toHttpErrorPayload } from '@/lib/requirements/http-errors'
import { createRequirementsRestRuntime } from '@/lib/requirements/server'
import { authorize } from '@/lib/requirements/service-shared'
import { specificationItemQueryStateSchema } from '@/lib/requirements/specification-item-query'

export const dynamic = 'force-dynamic'

type Params = Promise<{ id: string }>

const specificationParamSchema = idParamSchema

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
    specificationItemQueryStateSchema,
  )
  if (!parsedQuery.ok) {
    return parsedQuery.response
  }

  const { id } = parsedParams.data
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

    const data = await collectSpecificationTraceabilityData(
      runtime.db,
      specification,
      parsedQuery.data,
    )
    const response = NextResponse.json(data, {
      headers: { 'Cache-Control': 'no-store' },
    })
    return applyResponseCorrelationHeaders(response, runtime.context)
  } catch (error) {
    return applyResponseCorrelationHeaders(
      errorResponse(error),
      runtime.context,
    )
  }
}
