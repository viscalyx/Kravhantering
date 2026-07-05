import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  getSpecificationById,
  type SpecificationItemRef,
} from '@/lib/dal/requirements-specifications'
import {
  ARRAY_INPUT_MAX_ITEMS,
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

export const dynamic = 'force-dynamic'

type Params = Promise<{ id: string }>

const itemRefSchema = z
  .string()
  .trim()
  .regex(/^(lib|local):[1-9]\d*$/, 'Expected item refs like lib:1 or local:1')

const itemRefsQuerySchema = z
  .preprocess(value => {
    const values = Array.isArray(value) ? value : value == null ? [] : [value]
    return values.flatMap(entry =>
      String(entry)
        .split(',')
        .map(part => part.trim())
        .filter(Boolean),
    )
  }, z.array(itemRefSchema).min(1).max(ARRAY_INPUT_MAX_ITEMS))
  .refine(values => new Set(values).size === values.length, {
    message: 'Expected unique item references',
  })

const specificationParamSchema = idParamSchema

const traceabilityQuerySchema = z
  .object({
    refs: itemRefsQuerySchema,
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
    traceabilityQuerySchema,
  )
  if (!parsedQuery.ok) {
    return parsedQuery.response
  }

  const { id } = parsedParams.data
  const itemRefs = parsedQuery.data.refs as SpecificationItemRef[]

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
      itemRefs,
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
