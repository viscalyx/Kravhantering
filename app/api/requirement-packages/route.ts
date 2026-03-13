import { getCloudflareContext } from '@opennextjs/cloudflare'
import { NextResponse } from 'next/server'
import { listPackages } from '@/lib/dal/requirement-packages'
import { getDb } from '@/lib/db'

export async function GET() {
  const { env } = await getCloudflareContext({ async: true })
  const db = getDb(env.DB)
  const packages = await listPackages(db)
  return NextResponse.json({ packages })
}

export async function POST(request: Request) {
  const { env } = await getCloudflareContext({ async: true })
  const db = getDb(env.DB)
  const { createPackage } = await import('@/lib/dal/requirement-packages')
  const body = (await request.json()) as Parameters<typeof createPackage>[1]
  const pkg = await createPackage(db, body)
  return NextResponse.json(pkg, { status: 201 })
}
