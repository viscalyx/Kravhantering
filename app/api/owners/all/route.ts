import { getCloudflareContext } from '@opennextjs/cloudflare'
import { NextResponse } from 'next/server'
import { listOwners } from '@/lib/dal/owners'
import { getDb } from '@/lib/db'

export async function GET() {
  const { env } = await getCloudflareContext({ async: true })
  const db = getDb(env.DB)
  const owners = await listOwners(db)
  return NextResponse.json({ owners })
}
