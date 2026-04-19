import { type NextRequest, NextResponse } from 'next/server'
import { deleteArea, updateArea } from '@/lib/dal/requirement-areas'
import { getRequestDatabase } from '@/lib/db'

type Params = Promise<{ id: string }>

export async function PUT(
  request: NextRequest,
  { params }: { params: Params },
) {
  const { id } = await params
  const db = await getRequestDatabase()
  const body = (await request.json()) as Parameters<typeof updateArea>[2]
  const area = await updateArea(db, Number(id), body)
  return NextResponse.json(area)
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Params },
) {
  const { id } = await params
  const db = await getRequestDatabase()
  await deleteArea(db, Number(id))
  return NextResponse.json({ ok: true })
}
