import { NextResponse } from 'next/server'
import { listOwners } from '@/lib/dal/owners'
import { createArea, listAreas } from '@/lib/dal/requirement-areas'
import { getRequestDatabase } from '@/lib/db'

export async function GET() {
  const db = await getRequestDatabase()
  const [areas, owners] = await Promise.all([listAreas(db), listOwners(db)])
  const ownerMap = new Map(
    owners.map(o => [o.id, `${o.firstName} ${o.lastName}`]),
  )
  const enriched = areas.map(a => ({
    ...a,
    ownerName: a.ownerId ? (ownerMap.get(a.ownerId) ?? null) : null,
  }))
  return NextResponse.json({ areas: enriched })
}

export async function POST(request: Request) {
  const db = await getRequestDatabase()
  const body = (await request.json()) as Parameters<typeof createArea>[1]
  const area = await createArea(db, body)
  return NextResponse.json(area, { status: 201 })
}
