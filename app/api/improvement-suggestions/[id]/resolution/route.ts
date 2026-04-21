import { type NextRequest, NextResponse } from 'next/server'
import {
  recordResolution,
  SUGGESTION_DISMISSED,
  SUGGESTION_RESOLVED,
} from '@/lib/dal/improvement-suggestions'
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

  const { resolution, resolutionMotivation, resolvedBy } = body as {
    resolution?: number
    resolutionMotivation?: string
    resolvedBy?: string
  }

  if (
    typeof resolution !== 'number' ||
    typeof resolutionMotivation !== 'string' ||
    typeof resolvedBy !== 'string'
  ) {
    return NextResponse.json(
      {
        error:
          'resolution (number), resolutionMotivation (string), and resolvedBy (string) are required',
      },
      { status: 400 },
    )
  }

  if (
    !Number.isFinite(resolution) ||
    !Number.isInteger(resolution) ||
    (resolution !== SUGGESTION_RESOLVED && resolution !== SUGGESTION_DISMISSED)
  ) {
    return NextResponse.json(
      { error: 'resolution must be 1 (resolved) or 2 (dismissed)' },
      { status: 400 },
    )
  }

  if (!resolutionMotivation.trim()) {
    return NextResponse.json(
      { error: 'resolutionMotivation must not be empty' },
      { status: 400 },
    )
  }

  if (!resolvedBy.trim()) {
    return NextResponse.json(
      { error: 'resolvedBy must not be empty' },
      { status: 400 },
    )
  }
  const db = await getRequestSqlServerDataSource()

  try {
    await recordResolution(db, numericId, {
      resolution,
      resolutionMotivation,
      resolvedBy,
    })
    return NextResponse.json({ ok: true })
  } catch (error) {
    if (isRequirementsServiceError(error)) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      )
    }
    console.error('Failed to record suggestion resolution', error)
    return NextResponse.json(
      { error: 'Failed to record resolution' },
      { status: 500 },
    )
  }
}
