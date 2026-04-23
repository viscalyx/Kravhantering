import { type NextRequest, NextResponse } from 'next/server'
import {
  deletePackageResponsibilityArea,
  updatePackageResponsibilityArea,
} from '@/lib/dal/package-responsibility-areas'
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
    typeof updatePackageResponsibilityArea
  >[2]
  const area = await updatePackageResponsibilityArea(db, numericId, body)
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
  await deletePackageResponsibilityArea(db, numericId)
  return NextResponse.json({ ok: true })
}
