import { getCloudflareContext } from '@opennextjs/cloudflare'
import { type NextRequest, NextResponse } from 'next/server'
import {
  createTypeCategory,
  listTypeCategories,
} from '@/lib/dal/requirement-types'
import { getDb } from '@/lib/db'

export async function GET(request: NextRequest) {
  const { env } = await getCloudflareContext({ async: true })
  const db = getDb(env.DB)

  const url = new URL(request.url)
  const typeId = url.searchParams.get('typeId')

  const typeCategories = await listTypeCategories(
    db,
    typeId ? Number(typeId) : undefined,
  )
  return NextResponse.json({ typeCategories })
}

export async function POST(request: Request) {
  const { env } = await getCloudflareContext({ async: true })
  const db = getDb(env.DB)
  const body = (await request.json()) as Parameters<
    typeof createTypeCategory
  >[1]
  const category = await createTypeCategory(db, body)
  return NextResponse.json(category, { status: 201 })
}
