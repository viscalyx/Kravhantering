import { getCloudflareContext } from '@opennextjs/cloudflare'
import { NextResponse } from 'next/server'
import { createArea, listAreas } from '@/lib/dal/requirement-areas'
import { getDb } from '@/lib/db'

export const runtime = 'edge'

export async function GET() {
  const { env } = await getCloudflareContext()
  const db = getDb(env.DB)
  const areas = await listAreas(db)
  return NextResponse.json({ areas })
}

export async function POST(request: Request) {
  const { env } = await getCloudflareContext()
  const db = getDb(env.DB)
  const body = (await request.json()) as Parameters<typeof createArea>[1]
  const area = await createArea(db, body)
  return NextResponse.json(area, { status: 201 })
}
