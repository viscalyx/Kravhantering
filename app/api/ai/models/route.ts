import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { listModels, type OpenRouterModel } from '@/lib/ai/openrouter-client'
import {
  AI_PROVIDER_UNAVAILABLE_MESSAGE,
  logSanitizedError,
} from '@/lib/http/safe-errors'
import {
  ARRAY_INPUT_MAX_ITEMS,
  boundedDbStringSchema,
  parseSearchParams,
  parseWithSchema,
} from '@/lib/http/validation'
import {
  observeCapacity,
  recordCapacityEvent,
} from '@/lib/observability/capacity'
import { applyResponseCorrelationHeaders } from '@/lib/observability/request-ids'
import { checkInMemoryThrottle } from '@/lib/observability/throttle'
import { createRequestContext } from '@/lib/requirements/auth'

// ---------------------------------------------------------------------------
// In-memory cache (24 h TTL, keyed by supported_parameters)
// ---------------------------------------------------------------------------

const CACHE_TTL_MS = 24 * 60 * 60 * 1000
const AI_MODELS_REFRESH_RATE_LIMIT = 10
const AI_MODELS_REFRESH_RATE_WINDOW_MS = 60_000
const AI_MODELS_SLOW_THRESHOLD_MS = 2_000

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
  const context = await createRequestContext(request, 'rest')
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
      return applyResponseCorrelationHeaders(
        NextResponse.json({ models: cached.models }),
        context,
      )
    }
  } else {
    const throttle = checkInMemoryThrottle({
      key: [
        'ai.models.refresh',
        context.actor.source,
        context.actor.id ?? context.actor.hsaId ?? context.correlationId,
      ].join(':'),
      limit: AI_MODELS_REFRESH_RATE_LIMIT,
      windowMs: AI_MODELS_REFRESH_RATE_WINDOW_MS,
    })
    if (!throttle.allowed) {
      recordCapacityEvent({
        correlationId: context.correlationId,
        event: 'capacity.throttled',
        level: 'warn',
        metrics: { throttled: true },
        operation: 'ai.models.refresh',
        outcome: 'throttled',
        requestId: context.requestId,
        retryAfterSeconds: throttle.retryAfterSeconds,
        source: 'rest',
        statusCode: 429,
      })
      return applyResponseCorrelationHeaders(
        NextResponse.json(
          { error: 'Too many AI model refresh requests.', models: [] },
          {
            headers: {
              'Retry-After': String(throttle.retryAfterSeconds),
            },
            status: 429,
          },
        ),
        context,
      )
    }
  }

  try {
    // Fetch both the base list and the structured-outputs subset in parallel.
    // OpenRouter only exposes structured_outputs as a query filter — it is not
    // included in the per-model supported_parameters array, so we need a second
    // call to discover which models support json_schema.
    const enriched = await observeCapacity(
      {
        correlationId: context.correlationId,
        operation: refresh ? 'ai.models.refresh' : 'ai.models.list',
        requestId: context.requestId,
        slowThresholdMs: AI_MODELS_SLOW_THRESHOLD_MS,
        source: 'rest',
      },
      async () => {
        const structuredFilter = [...(paramList ?? []), 'structured_outputs']
        const [models, structuredModels] = await Promise.all([
          listModels(paramList),
          listModels(structuredFilter),
        ])
        const structuredIds = new Set(structuredModels.map(m => m.id))
        return models.map(m => {
          const extra: string[] = []
          if (structuredIds.has(m.id)) extra.push('structured_outputs')
          if (m.modality?.includes('image')) extra.push('vision')
          return extra.length > 0
            ? {
                ...m,
                supportedParameters: [...m.supportedParameters, ...extra],
              }
            : m
        })
      },
    )
    modelCache.set(cacheKey, { models: enriched, timestamp: Date.now() })
    return applyResponseCorrelationHeaders(
      NextResponse.json({ models: enriched }),
      context,
    )
  } catch (err) {
    logSanitizedError('Failed to list AI models', err)
    return applyResponseCorrelationHeaders(
      NextResponse.json(
        { error: AI_PROVIDER_UNAVAILABLE_MESSAGE, models: [] },
        { status: 503 },
      ),
      context,
    )
  }
}
