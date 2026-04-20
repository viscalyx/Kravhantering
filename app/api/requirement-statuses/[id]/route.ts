import { type NextRequest, NextResponse } from 'next/server'
import { deleteStatus, updateStatus } from '@/lib/dal/requirement-statuses'
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
  const body = (await request.json()) as Parameters<typeof updateStatus>[2]
  const updated = await updateStatus(db, numericId, body)
  return NextResponse.json(updated)
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
  try {
    await deleteStatus(db, numericId)
    return NextResponse.json({ ok: true })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to delete status'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
