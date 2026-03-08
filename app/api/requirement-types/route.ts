import { getCloudflareContext } from '@opennextjs/cloudflare'
import { NextResponse } from 'next/server'
import { listTypes } from '@/lib/dal/requirement-types'
import { getDb } from '@/lib/db'

export const runtime = 'edge'

export async function GET() {
  const { env } = await getCloudflareContext()
  const db = getDb(env.DB)
  const types = await listTypes(db)
  return NextResponse.json({ types })
}
