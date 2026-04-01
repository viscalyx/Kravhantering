import { getCloudflareContext } from '@opennextjs/cloudflare'
import { type NextRequest, NextResponse } from 'next/server'
import {
  createPackage,
  isSlugTaken,
  listPackages,
} from '@/lib/dal/requirement-packages'
import { getDb } from '@/lib/db'

export async function GET() {
  const { env } = await getCloudflareContext({ async: true })
  const db = getDb(env.DB)
  const packages = await listPackages(db)
  return NextResponse.json({ packages })
}

export async function POST(request: NextRequest) {
  const { env } = await getCloudflareContext({ async: true })
  const db = getDb(env.DB)
  const body = (await request.json()) as Parameters<typeof createPackage>[1]

  if (await isSlugTaken(db, body.uniqueId)) {
    return NextResponse.json({ error: 'slug_taken' }, { status: 409 })
  }

  const pkg = await createPackage(db, body)
  return NextResponse.json(pkg, { status: 201 })
}
