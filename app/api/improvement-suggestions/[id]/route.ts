import { getCloudflareContext } from '@opennextjs/cloudflare'
import { type NextRequest, NextResponse } from 'next/server'
import {
  deleteSuggestion,
  getSuggestion,
  updateSuggestion,
} from '@/lib/dal/improvement-suggestions'
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
    const item = await getSuggestion(db, numericId)
    return NextResponse.json(item)
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

  const { content } = body as { content?: string }

  const { env } = await getCloudflareContext({ async: true })
  const db = getDb(env.DB)

  try {
    await updateSuggestion(db, numericId, { content })
    return NextResponse.json({ ok: true })
  } catch (error) {
    if (isRequirementsServiceError(error)) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      )
    }
    console.error('Failed to update improvement suggestion', error)
    return NextResponse.json(
      { error: 'Failed to update improvement suggestion' },
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
    await deleteSuggestion(db, numericId)
    return NextResponse.json({ ok: true })
  } catch (error) {
    if (isRequirementsServiceError(error)) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      )
    }
    console.error('Failed to delete improvement suggestion', error)
    return NextResponse.json(
      { error: 'Failed to delete improvement suggestion' },
      { status: 500 },
    )
  }
}
