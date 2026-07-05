import { type NextRequest, NextResponse } from 'next/server'
import { specificationRfiListParamsSchema } from '@/app/api/rfi-questions/_schemas'
import { getSpecificationById } from '@/lib/dal/requirements-specifications'
import { getSpecificationRfiList } from '@/lib/dal/rfi-questions'
import { parseRouteParams } from '@/lib/http/validation'
import { applyResponseCorrelationHeaders } from '@/lib/observability/request-ids'
import { toHttpErrorPayload } from '@/lib/requirements/http-errors'
import { createRequirementsRestRuntime } from '@/lib/requirements/server'
import { authorize } from '@/lib/requirements/service-shared'

export const dynamic = 'force-dynamic'

type Params = Promise<{ id: string }>

function errorResponse(error: unknown) {
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
  const parsedParams = await parseRouteParams(
    params,
    specificationRfiListParamsSchema,
  )
  if (!parsedParams.ok) return parsedParams.response

  const runtime = await createRequirementsRestRuntime(request)
  try {
    const specification = await getSpecificationById(
      runtime.db,
      parsedParams.data.id,
    )
    if (!specification) {
      return applyResponseCorrelationHeaders(
        NextResponse.json(
          { error: 'Specification not found' },
          { headers: { 'Cache-Control': 'no-store' }, status: 404 },
        ),
        runtime.context,
      )
    }

    await authorize(
      runtime.authorization,
      { kind: 'get_specification_items', specificationId: specification.id },
      runtime.context,
    )

    const list = await getSpecificationRfiList(runtime.db, specification.id)
    return applyResponseCorrelationHeaders(
      NextResponse.json(
        {
          list,
          specification: {
            id: specification.id,
            name: specification.name,
            specificationCode: specification.specificationCode,
          },
        },
        { headers: { 'Cache-Control': 'no-store' } },
      ),
      runtime.context,
    )
  } catch (error) {
    return applyResponseCorrelationHeaders(
      errorResponse(error),
      runtime.context,
    )
  }
}
