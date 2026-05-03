import { type NextRequest, NextResponse } from 'next/server'
import {
  deleteSpecificationItemStatus,
  getLinkedPackageItems,
  getSpecificationItemStatusById,
  updateSpecificationItemStatus,
} from '@/lib/dal/specification-item-statuses'
import { getRequestSqlServerDataSource } from '@/lib/db'

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
  const db = await getRequestSqlServerDataSource()
  const [status, linkedItems] = await Promise.all([
    getSpecificationItemStatusById(db, numericId),
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
  const db = await getRequestSqlServerDataSource()
  const body = (await request.json()) as Parameters<
    typeof updateSpecificationItemStatus
  >[2]
  const status = await updateSpecificationItemStatus(db, numericId, body)
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
  const db = await getRequestSqlServerDataSource()
  await deleteSpecificationItemStatus(db, numericId)
  return NextResponse.json({ ok: true })
}
