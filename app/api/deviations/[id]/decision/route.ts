import { type NextRequest, NextResponse } from 'next/server'
import { recordDecision } from '@/lib/dal/deviations'
import { getRequestSqlServerDataSource } from '@/lib/db'
import { isRequirementsServiceError } from '@/lib/requirements/errors'

type Params = Promise<{ id: string }>

export async function POST(
  request: NextRequest,
  { params }: { params: Params },
) {
  const { id } = await params
  const numericId = Number(id)
  if (!Number.isInteger(numericId) || numericId < 1) {
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
  const db = await getRequestSqlServerDataSource()

  try {
    await recordDecision(db, numericId, {
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
    console.error('Failed to record deviation decision', error)
    return NextResponse.json(
      { error: 'Failed to record decision' },
      { status: 500 },
    )
  }
}
