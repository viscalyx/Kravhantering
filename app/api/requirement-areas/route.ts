import { NextResponse } from 'next/server'
import { listOwners, type Owner } from '@/lib/dal/owners'
import {
  createArea,
  listAreas,
  type RequirementAreaRow,
} from '@/lib/dal/requirement-areas'
import { getRequestSqlServerDataSource } from '@/lib/db'

export async function GET() {
  const db = await getRequestSqlServerDataSource()
  const [areas, owners] = await Promise.all([listAreas(db), listOwners(db)])
  const ownerMap = new Map(
    owners.map((owner: Owner) => [
      owner.id,
      `${owner.firstName} ${owner.lastName}`,
    ]),
  )
  const enriched = areas.map((area: RequirementAreaRow) => ({
    ...area,
    ownerName: area.ownerId ? (ownerMap.get(area.ownerId) ?? null) : null,
  }))
  return NextResponse.json({ areas: enriched })
}

export async function POST(request: Request) {
  const db = await getRequestSqlServerDataSource()
  const body = (await request.json()) as Parameters<typeof createArea>[1]
  const area = await createArea(db, body)
  return NextResponse.json(area, { status: 201 })
}
