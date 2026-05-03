import { type NextRequest, NextResponse } from 'next/server'
import {
  deleteSpecificationResponsibilityArea,
  updateSpecificationResponsibilityArea,
} from '@/lib/dal/specification-responsibility-areas'
import { getRequestSqlServerDataSource } from '@/lib/db'

type Params = Promise<{ id: string }>

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
    typeof updateSpecificationResponsibilityArea
  >[2]
  const area = await updateSpecificationResponsibilityArea(db, numericId, body)
  return NextResponse.json(area)
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
  await deleteSpecificationResponsibilityArea(db, numericId)
  return NextResponse.json({ ok: true })
}
