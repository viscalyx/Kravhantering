import { getCloudflareContext } from '@opennextjs/cloudflare'
import { NextResponse } from 'next/server'
import { listTypes } from '@/lib/dal/requirement-types'
import { getDb } from '@/lib/db'

export async function GET() {
  const { env } = await getCloudflareContext({ async: true })
  const db = getDb(env.DB)
  const types = await listTypes(db)
  return NextResponse.json({ types })
}
