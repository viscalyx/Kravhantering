import { getCloudflareContext } from '@opennextjs/cloudflare'
import { type NextRequest, NextResponse } from 'next/server'
import {
  deleteDeviation,
  getDeviation,
  updateDeviation,
} from '@/lib/dal/deviations'
import { getDb } from '@/lib/db'
import { isRequirementsServiceError } from '@/lib/requirements/errors'

type Params = Promise<{ id: string }>

export async function GET(
  _request: NextRequest,
  { params }: { params: Params },
) {
  const { id } = await params
  const numericId = Number(id)
  if (!Number.isInteger(numericId) || numericId < 1) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  }

  const { env } = await getCloudflareContext({ async: true })
  const db = getDb(env.DB)

  try {
    const deviation = await getDeviation(db, numericId)
    return NextResponse.json(deviation)
  } catch (error) {
    if (isRequirementsServiceError(error) && error.code === 'not_found') {
      return NextResponse.json({ error: error.message }, { status: 404 })
    }
    throw error
  }
}

export async function PUT(
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

  const { motivation } = body as { motivation?: string }

  const { env } = await getCloudflareContext({ async: true })
  const db = getDb(env.DB)

  try {
    await updateDeviation(db, numericId, { motivation })
    return NextResponse.json({ ok: true })
  } catch (error) {
    if (isRequirementsServiceError(error)) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      )
    }
    console.error('Failed to update deviation', error)
    return NextResponse.json(
      { error: 'Failed to update deviation' },
      { status: 500 },
    )
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Params },
) {
  const { id } = await params
  const numericId = Number(id)
  if (!Number.isInteger(numericId) || numericId < 1) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  }

  const { env } = await getCloudflareContext({ async: true })
  const db = getDb(env.DB)

  try {
    await deleteDeviation(db, numericId)
    return NextResponse.json({ ok: true })
  } catch (error) {
    if (isRequirementsServiceError(error)) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      )
    }
    console.error('Failed to delete deviation', error)
    return NextResponse.json(
      { error: 'Failed to delete deviation' },
      { status: 500 },
    )
  }
}
