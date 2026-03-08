import { getCloudflareContext } from '@opennextjs/cloudflare'
import { type NextRequest, NextResponse } from 'next/server'
import { listTypeCategories } from '@/lib/dal/requirement-types'
import { getDb } from '@/lib/db'

export const runtime = 'edge'

export async function GET(request: NextRequest) {
  const { env } = await getCloudflareContext()
  const db = getDb(env.DB)

  const url = new URL(request.url)
  const typeId = url.searchParams.get('typeId')

  const typeCategories = await listTypeCategories(
    db,
    typeId ? Number(typeId) : undefined,
  )
  return NextResponse.json({ typeCategories })
}
