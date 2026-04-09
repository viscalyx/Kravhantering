import { getCloudflareContext } from '@opennextjs/cloudflare'
import { type NextRequest, NextResponse } from 'next/server'
import { buildSystemPrompt } from '@/lib/ai/requirement-prompt'
import { loadTaxonomy } from '@/lib/ai/taxonomy'
import { getDb } from '@/lib/db'

export async function GET(request: NextRequest) {
  const locale =
    request.nextUrl.searchParams.get('locale') === 'sv' ? 'sv' : 'en'

  const { env } = await getCloudflareContext({ async: true })
  const db = getDb(env.DB)

  const taxonomy = await loadTaxonomy(db, locale)
  const prompt = buildSystemPrompt(taxonomy, locale)

  return NextResponse.json({ prompt })
}
