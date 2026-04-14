import { getCloudflareContext } from '@opennextjs/cloudflare'
import { type NextRequest, NextResponse } from 'next/server'
import {
  deletePackageLocalDeviation,
  getPackageLocalDeviation,
  updatePackageLocalDeviation,
} from '@/lib/dal/deviations'
import { getDb } from '@/lib/db'
import { isRequirementsServiceError } from '@/lib/requirements/errors'

type Params = Promise<{ id: string }>

function parseDeviationId(id: string) {
  const numericId = Number(id)
  return Number.isInteger(numericId) && numericId > 0 ? numericId : null
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Params },
) {
  const { id } = await params
  const deviationId = parseDeviationId(id)
  if (deviationId == null) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  }

  const { env } = await getCloudflareContext({ async: true })
  const db = getDb(env.DB)

  try {
    return NextResponse.json(await getPackageLocalDeviation(db, deviationId))
  } catch (error) {
    if (isRequirementsServiceError(error)) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      )
    }

    console.error('Failed to get package-local deviation', error)
    return NextResponse.json(
      { error: 'Failed to get package-local deviation' },
      { status: 500 },
    )
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Params },
) {
  const { id } = await params
  const deviationId = parseDeviationId(id)
  if (deviationId == null) {
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

  const { motivation } = body as { motivation?: string }
  const { env } = await getCloudflareContext({ async: true })
  const db = getDb(env.DB)

  try {
    await updatePackageLocalDeviation(db, deviationId, { motivation })
    return NextResponse.json({ ok: true })
  } catch (error) {
    if (isRequirementsServiceError(error)) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      )
    }

    console.error('Failed to update package-local deviation', error)
    return NextResponse.json(
      { error: 'Failed to update package-local deviation' },
      { status: 500 },
    )
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Params },
) {
  const { id } = await params
  const deviationId = parseDeviationId(id)
  if (deviationId == null) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  }

  const { env } = await getCloudflareContext({ async: true })
  const db = getDb(env.DB)

  try {
    await deletePackageLocalDeviation(db, deviationId)
    return NextResponse.json({ ok: true })
  } catch (error) {
    if (isRequirementsServiceError(error)) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      )
    }

    console.error('Failed to delete package-local deviation', error)
    return NextResponse.json(
      { error: 'Failed to delete package-local deviation' },
      { status: 500 },
    )
  }
}
