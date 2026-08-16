import { type NextRequest, NextResponse } from 'next/server'
import {
  countDeviationsBySpecification,
  listDeviationsForSpecification,
} from '@/lib/dal/deviations'
import { withRestResponsePolicy } from '@/lib/http/response-policy'
import { idParamSchema, parseRouteParams } from '@/lib/http/validation'
import { isRequirementsServiceError } from '@/lib/requirements/errors'
import { toHttpErrorPayload } from '@/lib/requirements/http-errors'
import { createRequirementsRestRuntime } from '@/lib/requirements/server'
import { authorize } from '@/lib/requirements/service-shared'

export const dynamic = 'force-dynamic'

type Params = Promise<{ id: string }>

const specificationParamSchema = idParamSchema

async function getHandler(
  request: NextRequest,
  { params }: { params: Params },
) {
  const parsedParams = await parseRouteParams(params, specificationParamSchema)
  if (!parsedParams.ok) {
    return parsedParams.response
  }
  const { id } = parsedParams.data
  const runtime = await createRequirementsRestRuntime(request)

  try {
    await authorize(
      runtime.authorization,
      {
        childKind: 'deviation_collection',
        kind: 'get_specification_child',
        specificationId: id,
      },
      runtime.context,
    )
    const deviations = await listDeviationsForSpecification(runtime.db, id)
    const counts = await countDeviationsBySpecification(runtime.db, id)

    return NextResponse.json({ counts, deviations })
  } catch (error) {
    if (!isRequirementsServiceError(error)) throw error
    const { body, status } = toHttpErrorPayload(error)
    return NextResponse.json(body, { status })
  }
}

export const GET = withRestResponsePolicy(getHandler)
