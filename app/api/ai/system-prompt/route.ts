import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { buildSystemPrompt } from '@/lib/ai/requirement-prompt'
import { loadTaxonomy } from '@/lib/ai/taxonomy'
import { getRequestSqlServerDataSource } from '@/lib/db'
import {
  optionalLocaleQuerySchema,
  parseSearchParams,
} from '@/lib/http/validation'

const systemPromptQuerySchema = z
  .object({
    locale: optionalLocaleQuerySchema,
  })
  .strict()

export async function GET(request: NextRequest) {
  const parsedQuery = parseSearchParams(
    request.nextUrl.searchParams,
    systemPromptQuerySchema,
  )
  if (!parsedQuery.ok) {
    return parsedQuery.response
  }
  const { locale } = parsedQuery.data
  const db = await getRequestSqlServerDataSource()

  const taxonomy = await loadTaxonomy(db, locale)
  const prompt = buildSystemPrompt(taxonomy, locale)

  return NextResponse.json({ prompt })
}
