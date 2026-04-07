import { getCloudflareContext } from '@opennextjs/cloudflare'
import { type NextRequest, NextResponse } from 'next/server'
import {
  getPackageItemById,
  updatePackageItemFields,
} from '@/lib/dal/requirement-packages'
import { getDb } from '@/lib/db'

type Params = Promise<{ id: string; itemId: string }>

export async function PATCH(
  request: NextRequest,
  { params }: { params: Params },
) {
  const { id, itemId } = await params
  const numericItemId = Number(itemId)
  if (!Number.isInteger(numericItemId) || numericItemId < 1) {
    return NextResponse.json({ error: 'Invalid itemId' }, { status: 400 })
  }
  const numericPackageId = Number(id)
  if (!Number.isInteger(numericPackageId) || numericPackageId < 1) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  }
  let body: { packageItemStatusId?: number | null; note?: string | null }
  try {
    const raw: unknown = await request.json()
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      return NextResponse.json({ error: 'Malformed payload' }, { status: 400 })
    }
    const obj = raw as Record<string, unknown>
    if (
      'packageItemStatusId' in obj &&
      obj.packageItemStatusId !== null &&
      obj.packageItemStatusId !== undefined &&
      typeof obj.packageItemStatusId !== 'number'
    ) {
      return NextResponse.json({ error: 'Malformed payload' }, { status: 400 })
    }
    if (
      'note' in obj &&
      obj.note !== null &&
      obj.note !== undefined &&
      typeof obj.note !== 'string'
    ) {
      return NextResponse.json({ error: 'Malformed payload' }, { status: 400 })
    }
    body = obj as typeof body
  } catch {
    return NextResponse.json({ error: 'Malformed payload' }, { status: 400 })
  }
  const { env } = await getCloudflareContext({ async: true })
  const db = getDb(env.DB)
  const item = await getPackageItemById(db, numericItemId)
  if (!item || item.packageId !== numericPackageId) {
    return NextResponse.json(
      { error: 'Item not found in package' },
      { status: 404 },
    )
  }
  await updatePackageItemFields(db, numericItemId, body)
  return NextResponse.json({ ok: true })
}
