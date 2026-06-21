import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenRouterModel } from '@/lib/ai/openrouter-client'
import { listOpenRouterModelCatalog } from '@/lib/ai/openrouter-model-catalog'
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
import {
  createDefaultAuthorizationService,
  createRequestContext,
  type RequestContext,
  type RequirementsAction,
} from '@/lib/requirements/auth'
import { toHttpErrorPayload } from '@/lib/requirements/http-errors'
import { recordAuthorizationDenied } from '@/lib/requirements/security-audit'

// ---------------------------------------------------------------------------
// In-memory cache (24 h TTL, keyed by supported_parameters)
// ---------------------------------------------------------------------------

const CACHE_TTL_MS = 24 * 60 * 60 * 1000
const AI_MODELS_REFRESH_RATE_LIMIT = 10
const AI_MODELS_REFRESH_RATE_WINDOW_MS = 60_000
const AI_MODELS_SLOW_THRESHOLD_MS = 2_000
const MAX_MODEL_CACHE_ENTRIES = 32

interface ModelCacheEntry {
  models: OpenRouterModel[]
  timestamp: number
}

const modelCache = new Map<string, ModelCacheEntry>()

const modelsQuerySchema = z
  .object({
    refresh: z.literal('1').optional(),
    scopeId: z.coerce.number().int().positive().optional(),
    scopeType: z.enum(['requirement_area', 'specification']).optional(),
    supported_parameters: z.string().trim().max(10_000).optional(),
  })
  .strict()
  .refine(query => (query.scopeId == null) === (query.scopeType == null), {
    message: 'scopeType and scopeId must be provided together',
    path: ['scopeId'],
  })

const supportedParametersSchema = z
  .array(boundedDbStringSchema)
  .max(ARRAY_INPUT_MAX_ITEMS)
  .refine(values => new Set(values).size === values.length, {
    message: 'Expected unique supported parameters',
  })

function isFreshCacheEntry(entry: ModelCacheEntry, now: number): boolean {
  return now - entry.timestamp < CACHE_TTL_MS
}

function getFreshModelCacheEntry(
  cacheKey: string,
  now: number,
): ModelCacheEntry | null {
  const cached = modelCache.get(cacheKey)
  if (!cached) return null
  if (!isFreshCacheEntry(cached, now)) {
    modelCache.delete(cacheKey)
    return null
  }

  modelCache.delete(cacheKey)
  modelCache.set(cacheKey, cached)
  return cached
}

function pruneExpiredModelCacheEntries(now: number): void {
  for (const [key, entry] of modelCache) {
    if (!isFreshCacheEntry(entry, now)) {
      modelCache.delete(key)
    }
  }
}

function setModelCacheEntry(
  cacheKey: string,
  models: OpenRouterModel[],
  now: number,
): void {
  pruneExpiredModelCacheEntries(now)
  if (modelCache.has(cacheKey)) {
    modelCache.delete(cacheKey)
  }

  while (modelCache.size >= MAX_MODEL_CACHE_ENTRIES) {
    const oldestKey = modelCache.keys().next().value
    if (oldestKey === undefined) break
    modelCache.delete(oldestKey)
  }

  modelCache.set(cacheKey, { models, timestamp: now })
}

function checkAiModelsFetchThrottle(context: RequestContext) {
  return checkInMemoryThrottle({
    key: [
      'ai.models.refresh',
      context.actor.source,
      context.actor.id ?? context.actor.hsaId ?? context.correlationId,
    ].join(':'),
    limit: AI_MODELS_REFRESH_RATE_LIMIT,
    windowMs: AI_MODELS_REFRESH_RATE_WINDOW_MS,
  })
}

function createAiModelsThrottleResponse(
  context: RequestContext,
  throttle: ReturnType<typeof checkInMemoryThrottle>,
  operation: 'ai.models.list' | 'ai.models.refresh',
): Response {
  recordCapacityEvent({
    correlationId: context.correlationId,
    event: 'capacity.throttled',
    level: 'warn',
    metrics: { throttled: true },
    operation,
    outcome: 'throttled',
    requestId: context.requestId,
    retryAfterSeconds: throttle.retryAfterSeconds,
    source: 'rest',
    statusCode: 429,
  })
  return applyResponseCorrelationHeaders(
    NextResponse.json(
      {
        error:
          operation === 'ai.models.refresh'
            ? 'Too many AI model refresh requests.'
            : 'Too many AI model requests.',
        models: [],
      },
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

export function clearAiModelsCacheForTests(): void {
  modelCache.clear()
}

export async function GET(request: NextRequest) {
  const context = await createRequestContext(request, 'rest')
  const parsedQuery = parseSearchParams(
    request.nextUrl.searchParams,
    modelsQuerySchema,
  )
  if (!parsedQuery.ok) {
    return parsedQuery.response
  }
  const authorizationAction: RequirementsAction = {
    kind: 'generate_requirements',
    scopeId: parsedQuery.data.scopeId,
    scopeType: parsedQuery.data.scopeType,
  }
  try {
    await createDefaultAuthorizationService().assertAuthorized(
      authorizationAction,
      context,
    )
  } catch (error) {
    await recordAuthorizationDenied(context, authorizationAction, error)
    const { body, status } = toHttpErrorPayload(error)
    return applyResponseCorrelationHeaders(
      NextResponse.json(body, { status }),
      context,
    )
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

  const cacheKey = paramList ? [...paramList].sort().join(',') : '__default__'
  const now = Date.now()
  const operation = refresh ? 'ai.models.refresh' : 'ai.models.list'

  if (!refresh) {
    const cached = getFreshModelCacheEntry(cacheKey, now)
    if (cached) {
      return applyResponseCorrelationHeaders(
        NextResponse.json({ models: cached.models }),
        context,
      )
    }
  }

  const throttle = checkAiModelsFetchThrottle(context)
  if (!throttle.allowed) {
    return createAiModelsThrottleResponse(context, throttle, operation)
  }

  try {
    const enriched = await observeCapacity(
      {
        correlationId: context.correlationId,
        operation: refresh ? 'ai.models.refresh' : 'ai.models.list',
        requestId: context.requestId,
        slowThresholdMs: AI_MODELS_SLOW_THRESHOLD_MS,
        source: 'rest',
      },
      async () =>
        listOpenRouterModelCatalog({
          supportedParameters: paramList,
        }),
    )
    setModelCacheEntry(cacheKey, enriched, Date.now())
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
