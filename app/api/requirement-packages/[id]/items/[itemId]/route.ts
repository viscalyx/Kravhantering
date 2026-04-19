import { type NextRequest, NextResponse } from 'next/server'
import {
  getPackageById,
  getPackageBySlug,
  getPackageItemByRef,
  listPackageItems,
  updatePackageItemFieldsByItemRef,
} from '@/lib/dal/requirement-packages'
import { type getDb, getRequestDatabase } from '@/lib/db'

type Params = Promise<{ id: string; itemId: string }>

async function resolvePackageId(
  idOrSlug: string,
  db: ReturnType<typeof getDb>,
) {
  const bySlug = await getPackageBySlug(db, idOrSlug)
  if (bySlug) {
    return bySlug.id
  }

  if (/^\d+$/.test(idOrSlug)) {
    const byId = await getPackageById(db, Number(idOrSlug))
    return byId?.id ?? null
  }

  return null
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Params },
) {
  const { id, itemId } = await params
  const numericItemId = Number(itemId)

  if (!Number.isInteger(numericItemId) || numericItemId < 1) {
    return NextResponse.json({ error: 'Invalid itemId' }, { status: 400 })
  }
  const db = await getRequestDatabase()
  const packageId = await resolvePackageId(id, db)

  if (packageId === null) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const items = await listPackageItems(db, packageId)
  const item = items.find(
    candidate =>
      candidate.packageItemId === numericItemId && candidate.kind === 'library',
  )

  if (!item) {
    return NextResponse.json(
      { error: 'Item not found in package' },
      { status: 404 },
    )
  }

  return NextResponse.json({
    needsReference: item.needsReference ?? null,
    needsReferenceId: item.needsReferenceId ?? null,
    packageItemId: item.packageItemId,
    packageItemStatusColor: item.packageItemStatusColor ?? null,
    packageItemStatusId: item.packageItemStatusId ?? null,
    packageItemStatusNameEn: item.packageItemStatusNameEn ?? null,
    packageItemStatusNameSv: item.packageItemStatusNameSv ?? null,
  })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Params },
) {
  const { id, itemId } = await params
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
  const db = await getRequestDatabase()
  const packageId = await resolvePackageId(id, db)
  if (packageId === null) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  const decodedItemRef = decodeURIComponent(itemId)
  const item = await getPackageItemByRef(db, packageId, decodedItemRef)
  if (!item) {
    return NextResponse.json(
      { error: 'Item not found in package' },
      { status: 404 },
    )
  }
  await updatePackageItemFieldsByItemRef(db, packageId, decodedItemRef, body)
  return NextResponse.json({ ok: true })
}
