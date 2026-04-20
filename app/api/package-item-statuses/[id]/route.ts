import { type NextRequest, NextResponse } from 'next/server'
import {
  deletePackageItemStatus,
  getLinkedPackageItems,
  getPackageItemStatusById,
  updatePackageItemStatus,
} from '@/lib/dal/package-item-statuses'
import { getRequestDatabaseConnection } from '@/lib/db'

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
  const db = await getRequestDatabaseConnection()
  const [status, linkedItems] = await Promise.all([
    getPackageItemStatusById(db, numericId),
    getLinkedPackageItems(db, numericId),
  ])
  if (!status) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  return NextResponse.json({ status, linkedItems })
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
  const db = await getRequestDatabaseConnection()
  const body = (await request.json()) as Parameters<
    typeof updatePackageItemStatus
  >[2]
  const status = await updatePackageItemStatus(db, numericId, body)
  if (!status) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  return NextResponse.json(status)
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
  const db = await getRequestDatabaseConnection()
  await deletePackageItemStatus(db, numericId)
  return NextResponse.json({ ok: true })
}
