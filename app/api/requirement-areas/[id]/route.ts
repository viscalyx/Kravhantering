import { type NextRequest, NextResponse } from 'next/server'
import { deleteArea, updateArea } from '@/lib/dal/requirement-areas'
import { getRequestDatabaseConnection } from '@/lib/db'

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
  const db = await getRequestDatabaseConnection()
  const body = (await request.json()) as Parameters<typeof updateArea>[2]
  const area = await updateArea(db, numericId, body)
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
  const db = await getRequestDatabaseConnection()
  await deleteArea(db, numericId)
  return NextResponse.json({ ok: true })
}
