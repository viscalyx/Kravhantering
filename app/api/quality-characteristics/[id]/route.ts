import { type NextRequest, NextResponse } from 'next/server'
import {
  deleteQualityCharacteristic,
  listQualityCharacteristics,
  updateQualityCharacteristic,
} from '@/lib/dal/requirement-types'
import { getRequestDatabase } from '@/lib/db'

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
  const db = await getRequestDatabase()
  const body = (await request.json()) as Record<string, unknown>
  if (
    (body.nameSv != null && typeof body.nameSv !== 'string') ||
    (body.nameEn != null && typeof body.nameEn !== 'string')
  ) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  }
  const category = await updateQualityCharacteristic(
    db,
    numericId,
    body as Parameters<typeof updateQualityCharacteristic>[2],
  )
  if (!category) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  return NextResponse.json(category)
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
  const db = await getRequestDatabase()

  const allCategories = await listQualityCharacteristics(db)
  const hasChildren = allCategories.some(c => c.parentId === numericId)
  if (hasChildren) {
    return NextResponse.json(
      { error: 'Has sub-characteristics' },
      { status: 409 },
    )
  }

  try {
    const deleted = await deleteQualityCharacteristic(db, numericId)
    if (!deleted) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (/foreign.key/i.test(message) || /constraint/i.test(message)) {
      return NextResponse.json(
        { error: 'In use by requirements' },
        { status: 409 },
      )
    }
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    )
  }
  return NextResponse.json({ ok: true })
}
