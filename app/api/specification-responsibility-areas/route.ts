import { NextResponse } from 'next/server'
import {
  createSpecificationResponsibilityArea,
  listSpecificationResponsibilityAreas,
} from '@/lib/dal/specification-responsibility-areas'
import { getRequestSqlServerDataSource } from '@/lib/db'

export async function GET() {
  const db = await getRequestSqlServerDataSource()
  const areas = await listSpecificationResponsibilityAreas(db)
  return NextResponse.json({ areas })
}

export async function POST(request: Request) {
  const db = await getRequestSqlServerDataSource()
  const body = (await request.json()) as Parameters<
    typeof createSpecificationResponsibilityArea
  >[1]
  const area = await createSpecificationResponsibilityArea(db, body)
  return NextResponse.json(area, { status: 201 })
}
