import { type NextRequest, NextResponse } from 'next/server'
import {
  createQualityCharacteristic,
  listQualityCharacteristics,
} from '@/lib/dal/requirement-types'
import { getRequestDatabase } from '@/lib/db'

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const typeId = url.searchParams.get('typeId')

  if (typeId != null) {
    const parsed = Number(typeId)
    if (!Number.isInteger(parsed) || parsed < 1) {
      return NextResponse.json({ error: 'Invalid typeId' }, { status: 400 })
    }
    const db = await getRequestDatabase()
    const qualityCharacteristics = await listQualityCharacteristics(db, parsed)
    return NextResponse.json({ qualityCharacteristics })
  }

  const db = await getRequestDatabase()
  const qualityCharacteristics = await listQualityCharacteristics(db)
  return NextResponse.json({ qualityCharacteristics })
}

export async function POST(request: Request) {
  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  }
  if (
    typeof body.nameSv !== 'string' ||
    typeof body.nameEn !== 'string' ||
    typeof body.requirementTypeId !== 'number' ||
    (body.parentId != null && typeof body.parentId !== 'number')
  ) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  }
  const db = await getRequestDatabase()
  const category = await createQualityCharacteristic(
    db,
    body as unknown as Parameters<typeof createQualityCharacteristic>[1],
  )
  return NextResponse.json(category, { status: 201 })
}
