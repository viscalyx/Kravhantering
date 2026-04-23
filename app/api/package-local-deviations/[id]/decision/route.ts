import { type NextRequest, NextResponse } from 'next/server'
import { recordPackageLocalDecision } from '@/lib/dal/deviations'
import { getRequestSqlServerDataSource } from '@/lib/db'
import { isRequirementsServiceError } from '@/lib/requirements/errors'

type Params = Promise<{ id: string }>

export async function POST(
  request: NextRequest,
  { params }: { params: Params },
) {
  const { id } = await params
  const deviationId = Number(id)
  if (!Number.isInteger(deviationId) || deviationId < 1) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (typeof body !== 'object' || body === null) {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const { decision, decisionMotivation, decidedBy } = body as {
    decidedBy?: string
    decision?: number
    decisionMotivation?: string
  }

  if (
    typeof decision !== 'number' ||
    typeof decisionMotivation !== 'string' ||
    typeof decidedBy !== 'string'
  ) {
    return NextResponse.json(
      {
        error:
          'decision (number), decisionMotivation (string), and decidedBy (string) are required',
      },
      { status: 400 },
    )
  }

  try {
    const db = await getRequestSqlServerDataSource()
    await recordPackageLocalDecision(db, deviationId, {
      decision,
      decisionMotivation,
      decidedBy,
    })
    return NextResponse.json({ ok: true })
  } catch (error) {
    if (isRequirementsServiceError(error)) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      )
    }

    console.error('Failed to record package-local deviation decision', error)
    return NextResponse.json(
      { error: 'Failed to record decision' },
      { status: 500 },
    )
  }
}
