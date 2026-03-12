import { getCloudflareContext } from '@opennextjs/cloudflare'
import { NextResponse } from 'next/server'
import {
  createPackageImplementationType,
  listPackageImplementationTypes,
} from '@/lib/dal/package-implementation-types'
import { getDb } from '@/lib/db'

export async function GET() {
  const { env } = await getCloudflareContext({ async: true })
  const db = getDb(env.DB)
  const types = await listPackageImplementationTypes(db)
  return NextResponse.json({ types })
}

export async function POST(request: Request) {
  const { env } = await getCloudflareContext({ async: true })
  const db = getDb(env.DB)
  const body = (await request.json()) as Parameters<
    typeof createPackageImplementationType
  >[1]
  const type = await createPackageImplementationType(db, body)
  return NextResponse.json(type, { status: 201 })
}
