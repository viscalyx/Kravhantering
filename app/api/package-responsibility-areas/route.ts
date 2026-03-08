import { getCloudflareContext } from '@opennextjs/cloudflare'
import { NextResponse } from 'next/server'
import {
  createPackageResponsibilityArea,
  listPackageResponsibilityAreas,
} from '@/lib/dal/package-responsibility-areas'
import { getDb } from '@/lib/db'

export const runtime = 'edge'

export async function GET() {
  const { env } = await getCloudflareContext()
  const db = getDb(env.DB)
  const areas = await listPackageResponsibilityAreas(db)
  return NextResponse.json({ areas })
}

export async function POST(request: Request) {
  const { env } = await getCloudflareContext()
  const db = getDb(env.DB)
  const body = (await request.json()) as Parameters<
    typeof createPackageResponsibilityArea
  >[1]
  const area = await createPackageResponsibilityArea(db, body)
  return NextResponse.json(area, { status: 201 })
}
