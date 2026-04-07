import { getCloudflareContext } from '@opennextjs/cloudflare'
import { type NextRequest, NextResponse } from 'next/server'
import {
  createDeviation,
  listDeviationsForPackageItem,
} from '@/lib/dal/deviations'
import { getPackageItemById } from '@/lib/dal/requirement-packages'
import { getDb } from '@/lib/db'
import { isRequirementsServiceError } from '@/lib/requirements/errors'

type Params = Promise<{ id: string; itemId: string }>

export async function GET(
  _request: NextRequest,
  { params }: { params: Params },
) {
  const { id, itemId } = await params
  const numericId = Number(id)
  if (!Number.isInteger(numericId) || numericId < 1) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  }
  const numericItemId = Number(itemId)
  if (!Number.isInteger(numericItemId) || numericItemId < 1) {
    return NextResponse.json({ error: 'Invalid itemId' }, { status: 400 })
  }

  const { env } = await getCloudflareContext({ async: true })
  const db = getDb(env.DB)

  const item = await getPackageItemById(db, numericItemId)
  if (!item || item.packageId !== numericId) {
    return NextResponse.json(
      { error: 'Item not found in package' },
      { status: 404 },
    )
  }

  const deviations = await listDeviationsForPackageItem(db, numericItemId)
  return NextResponse.json({ deviations })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Params },
) {
  const { id, itemId } = await params
  const numericId = Number(id)
  if (!Number.isInteger(numericId) || numericId < 1) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  }
  const numericItemId = Number(itemId)
  if (!Number.isInteger(numericItemId) || numericItemId < 1) {
    return NextResponse.json({ error: 'Invalid itemId' }, { status: 400 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (
    typeof body !== 'object' ||
    body === null ||
    typeof (body as { motivation?: unknown }).motivation !== 'string'
  ) {
    return NextResponse.json(
      { error: 'motivation (string) is required' },
      { status: 400 },
    )
  }

  const { motivation, createdBy } = body as {
    createdBy?: string
    motivation: string
  }

  const { env } = await getCloudflareContext({ async: true })
  const db = getDb(env.DB)

  const item = await getPackageItemById(db, numericItemId)
  if (!item || item.packageId !== numericId) {
    return NextResponse.json(
      { error: 'Item not found in package' },
      { status: 404 },
    )
  }

  try {
    const result = await createDeviation(db, {
      packageItemId: numericItemId,
      motivation,
      createdBy: typeof createdBy === 'string' ? createdBy : null,
    })
    return NextResponse.json({ id: result.id, ok: true }, { status: 201 })
  } catch (error) {
    if (isRequirementsServiceError(error)) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      )
    }
    console.error('Failed to create deviation', error)
    return NextResponse.json(
      { error: 'Failed to create deviation' },
      { status: 500 },
    )
  }
}
