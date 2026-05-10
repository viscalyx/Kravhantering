import { type NextRequest, NextResponse } from 'next/server'
import { revertToDraft } from '@/lib/dal/improvement-suggestions'
import { getRequestSqlServerDataSource } from '@/lib/db'
import { idParamSchema, parseRouteParams } from '@/lib/http/validation'
import { isRequirementsServiceError } from '@/lib/requirements/errors'

export const dynamic = 'force-dynamic'

type Params = Promise<{ id: string }>

export async function POST(
  _request: NextRequest,
  { params }: { params: Params },
) {
  const parsedParams = await parseRouteParams(params, idParamSchema)
  if (!parsedParams.ok) return parsedParams.response
  const db = await getRequestSqlServerDataSource()

  try {
    await revertToDraft(db, parsedParams.data.id)
    return NextResponse.json({ ok: true })
  } catch (error) {
    if (isRequirementsServiceError(error)) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      )
    }
    console.error('Failed to revert suggestion to draft', error)
    return NextResponse.json(
      { error: 'Failed to revert to draft' },
      { status: 500 },
    )
  }
}
