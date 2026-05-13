import { type NextRequest, NextResponse } from 'next/server'
import { accessReviewServiceActor } from '@/lib/access-review/route-audit'
import {
  type AccessReviewRouteParams,
  accessReviewErrorResponse,
} from '@/lib/access-review/route-helpers'
import { getAccessReviewRun } from '@/lib/access-review/service'
import { getRequestSqlServerDataSource } from '@/lib/db'
import { idParamSchema, parseRouteParams } from '@/lib/http/validation'
import { createRequestContext } from '@/lib/requirements/auth'

export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  { params }: { params: AccessReviewRouteParams },
) {
  const parsedParams = await parseRouteParams(params, idParamSchema)
  if (!parsedParams.ok) return parsedParams.response

  try {
    const context = await createRequestContext(request, 'rest')
    const db = await getRequestSqlServerDataSource()
    const detail = await getAccessReviewRun(
      db,
      parsedParams.data.id,
      accessReviewServiceActor(context),
    )
    return NextResponse.json(detail)
  } catch (error) {
    return accessReviewErrorResponse('Failed to load access review', error)
  }
}
