import { type NextRequest, NextResponse } from 'next/server'
import {
  deletePackageResponsibilityArea,
  updatePackageResponsibilityArea,
} from '@/lib/dal/package-responsibility-areas'
import { getRequestDatabase } from '@/lib/db'

type Params = Promise<{ id: string }>

export async function PUT(
  request: NextRequest,
  { params }: { params: Params },
) {
  const { id } = await params
  const db = await getRequestDatabase()
  const body = (await request.json()) as Parameters<
    typeof updatePackageResponsibilityArea
  >[2]
  const area = await updatePackageResponsibilityArea(db, Number(id), body)
  return NextResponse.json(area)
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Params },
) {
  const { id } = await params
  const db = await getRequestDatabase()
  await deletePackageResponsibilityArea(db, Number(id))
  return NextResponse.json({ ok: true })
}
