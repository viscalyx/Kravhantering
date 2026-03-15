import { getCloudflareContext } from '@opennextjs/cloudflare'
import { type NextRequest, NextResponse } from 'next/server'
import {
  createQualityCharacteristic,
  listQualityCharacteristics,
} from '@/lib/dal/requirement-types'
import { getDb } from '@/lib/db'

export async function GET(request: NextRequest) {
  const { env } = await getCloudflareContext({ async: true })
  const db = getDb(env.DB)

  const url = new URL(request.url)
  const typeId = url.searchParams.get('typeId')

  const qualityCharacteristics = await listQualityCharacteristics(
    db,
    typeId ? Number(typeId) : undefined,
  )
  return NextResponse.json({ qualityCharacteristics })
}

export async function POST(request: Request) {
  const { env } = await getCloudflareContext({ async: true })
  const db = getDb(env.DB)
  const body = (await request.json()) as Record<string, unknown>
  if (
    typeof body.nameSv !== 'string' ||
    typeof body.nameEn !== 'string' ||
    typeof body.requirementTypeId !== 'number'
  ) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  }
  const category = await createQualityCharacteristic(
    db,
    body as unknown as Parameters<typeof createQualityCharacteristic>[1],
  )
  return NextResponse.json(category, { status: 201 })
}
