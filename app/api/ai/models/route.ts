import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { listModels, type OpenRouterModel } from '@/lib/ai/openrouter-client'
import {
  ARRAY_INPUT_MAX_ITEMS,
  boundedDbStringSchema,
  parseSearchParams,
  parseWithSchema,
} from '@/lib/http/validation'

// ---------------------------------------------------------------------------
// In-memory cache (24 h TTL, keyed by supported_parameters)
// ---------------------------------------------------------------------------

const CACHE_TTL_MS = 24 * 60 * 60 * 1000

const modelCache = new Map<
  string,
  { models: OpenRouterModel[]; timestamp: number }
>()

const modelsQuerySchema = z
  .object({
    refresh: z.literal('1').optional(),
    supported_parameters: z.string().trim().max(10_000).optional(),
  })
  .strict()

const supportedParametersSchema = z
  .array(boundedDbStringSchema)
  .max(ARRAY_INPUT_MAX_ITEMS)
  .refine(values => new Set(values).size === values.length, {
    message: 'Expected unique supported parameters',
  })

export async function GET(request: NextRequest) {
  const parsedQuery = parseSearchParams(
    request.nextUrl.searchParams,
    modelsQuerySchema,
  )
  if (!parsedQuery.ok) {
    return parsedQuery.response
  }
  const refresh = parsedQuery.data.refresh === '1'
  const extraParams = parsedQuery.data.supported_parameters
  const parsedParameters = parseWithSchema(
    supportedParametersSchema,
    extraParams ? extraParams.split(',').filter(Boolean) : [],
  )
  if (!parsedParameters.ok) {
    return parsedParameters.response
  }
  const paramList =
    parsedParameters.data.length > 0 ? parsedParameters.data : undefined

  const cacheKey = paramList ? paramList.sort().join(',') : '__default__'

  if (!refresh) {
    const cached = modelCache.get(cacheKey)
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return NextResponse.json({ models: cached.models })
    }
  }

  try {
    // Fetch both the base list and the structured-outputs subset in parallel.
    // OpenRouter only exposes structured_outputs as a query filter — it is not
    // included in the per-model supported_parameters array, so we need a second
    // call to discover which models support json_schema.
    const structuredFilter = [...(paramList ?? []), 'structured_outputs']
    const [models, structuredModels] = await Promise.all([
      listModels(paramList),
      listModels(structuredFilter),
    ])
    const structuredIds = new Set(structuredModels.map(m => m.id))
    const enriched = models.map(m => {
      const extra: string[] = []
      if (structuredIds.has(m.id)) extra.push('structured_outputs')
      if (m.modality?.includes('image')) extra.push('vision')
      return extra.length > 0
        ? { ...m, supportedParameters: [...m.supportedParameters, ...extra] }
        : m
    })
    modelCache.set(cacheKey, { models: enriched, timestamp: Date.now() })
    return NextResponse.json({ models: enriched })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    const status = message.includes('401') ? 401 : 503
    return NextResponse.json({ error: message, models: [] }, { status })
  }
}
