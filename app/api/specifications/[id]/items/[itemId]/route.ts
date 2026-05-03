import { type NextRequest, NextResponse } from 'next/server'
import {
  getPackageById,
  getPackageBySlug,
  getPackageItemByRef,
  listPackageItems,
  updatePackageItemFieldsByItemRef,
} from '@/lib/dal/requirements-specifications'
import type { SqlServerDatabase } from '@/lib/db'
import { getRequestSqlServerDataSource } from '@/lib/db'

type Params = Promise<{ id: string; itemId: string }>

async function resolvePackageId(idOrSlug: string, db: SqlServerDatabase) {
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
  const db = await getRequestSqlServerDataSource()
  const specificationId = await resolvePackageId(id, db)

  if (specificationId === null) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const items = await listPackageItems(db, specificationId)
  const item = items.find(
    candidate =>
      candidate.specificationItemId === numericItemId &&
      candidate.kind === 'library',
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
    specificationItemId: item.specificationItemId,
    specificationItemStatusColor: item.specificationItemStatusColor ?? null,
    specificationItemStatusId: item.specificationItemStatusId ?? null,
    specificationItemStatusNameEn: item.specificationItemStatusNameEn ?? null,
    specificationItemStatusNameSv: item.specificationItemStatusNameSv ?? null,
  })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Params },
) {
  const { id, itemId } = await params
  let body: { specificationItemStatusId?: number | null; note?: string | null }
  try {
    const raw: unknown = await request.json()
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      return NextResponse.json({ error: 'Malformed payload' }, { status: 400 })
    }
    const obj = raw as Record<string, unknown>
    if (
      'specificationItemStatusId' in obj &&
      obj.specificationItemStatusId !== null &&
      obj.specificationItemStatusId !== undefined &&
      (typeof obj.specificationItemStatusId !== 'number' ||
        !Number.isInteger(obj.specificationItemStatusId) ||
        obj.specificationItemStatusId <= 0)
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
  const db = await getRequestSqlServerDataSource()
  const specificationId = await resolvePackageId(id, db)
  if (specificationId === null) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  const decodedItemRef = decodeURIComponent(itemId)
  const item = await getPackageItemByRef(db, specificationId, decodedItemRef)
  if (!item) {
    return NextResponse.json(
      { error: 'Item not found in package' },
      { status: 404 },
    )
  }
  await updatePackageItemFieldsByItemRef(
    db,
    specificationId,
    decodedItemRef,
    body,
  )
  return NextResponse.json({ ok: true })
}
