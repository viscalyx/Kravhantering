import { getCloudflareContext } from '@opennextjs/cloudflare'
import { NextResponse } from 'next/server'
import { listCategories } from '@/lib/dal/requirement-categories'
import { getDb } from '@/lib/db'

export async function GET() {
  const { env } = await getCloudflareContext({ async: true })
  const db = getDb(env.DB)
  const categories = await listCategories(db)
  return NextResponse.json({ categories })
}
