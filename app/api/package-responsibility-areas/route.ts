import { NextResponse } from 'next/server'
import {
  createPackageResponsibilityArea,
  listPackageResponsibilityAreas,
} from '@/lib/dal/package-responsibility-areas'
import { getRequestDatabaseConnection } from '@/lib/db'

export async function GET() {
  const db = await getRequestDatabaseConnection()
  const areas = await listPackageResponsibilityAreas(db)
  return NextResponse.json({ areas })
}

export async function POST(request: Request) {
  const db = await getRequestDatabaseConnection()
  const body = (await request.json()) as Parameters<
    typeof createPackageResponsibilityArea
  >[1]
  const area = await createPackageResponsibilityArea(db, body)
  return NextResponse.json(area, { status: 201 })
}
