import { getCloudflareContext } from '@opennextjs/cloudflare'
import { NextResponse } from 'next/server'
import { listCategories } from '@/lib/dal/requirement-categories'
import { getDb } from '@/lib/db'

export const runtime = 'edge'

export async function GET() {
  const { env } = await getCloudflareContext()
  const db = getDb(env.DB)
  const categories = await listCategories(db)
  return NextResponse.json({ categories })
}
