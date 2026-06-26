import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getKeyInfo } from '@/lib/ai/openrouter-client'
import {
  AI_CREDIT_INFORMATION_UNAVAILABLE_MESSAGE,
  logSanitizedError,
} from '@/lib/http/safe-errors'
import { parseSearchParams } from '@/lib/http/validation'
import {
  observeCapacity,
  recordCapacityEvent,
} from '@/lib/observability/capacity'
import { applyResponseCorrelationHeaders } from '@/lib/observability/request-ids'
import { checkInMemoryThrottle } from '@/lib/observability/throttle'
import { createRequestContext } from '@/lib/requirements/auth'
import { unauthorizedError } from '@/lib/requirements/errors'
import { toHttpErrorPayload } from '@/lib/requirements/http-errors'

const AI_CREDITS_RATE_LIMIT = 20
const AI_CREDITS_RATE_WINDOW_MS = 60_000
const AI_CREDITS_SLOW_THRESHOLD_MS = 2_000

const aiCreditsQuerySchema = z
  .object({
    scopeId: z.coerce.number().int().positive().optional(),
    scopeType: z.enum(['requirement_area', 'specification']).optional(),
  })
  .strict()
  .refine(query => (query.scopeId == null) === (query.scopeType == null), {
    message: 'scopeType and scopeId must be provided together',
    path: ['scopeId'],
  })

export async function GET(request: Request) {
  const context = await createRequestContext(request, 'rest')
  const parsedQuery = parseSearchParams(
    new URL(request.url).searchParams,
    aiCreditsQuerySchema,
  )
  if (!parsedQuery.ok) return parsedQuery.response
  if (!context.actor.isAuthenticated) {
    const error = unauthorizedError()
    const { body, status } = toHttpErrorPayload(error)
    return applyResponseCorrelationHeaders(
      NextResponse.json(body, { status }),
      context,
    )
  }
  const throttle = checkInMemoryThrottle({
    key: [
      'ai.credits',
      context.actor.source,
      context.actor.id ?? context.actor.hsaId ?? context.correlationId,
    ].join(':'),
    limit: AI_CREDITS_RATE_LIMIT,
    windowMs: AI_CREDITS_RATE_WINDOW_MS,
  })

  if (!throttle.allowed) {
    recordCapacityEvent({
      correlationId: context.correlationId,
      event: 'capacity.throttled',
      level: 'warn',
      metrics: { throttled: true },
      operation: 'ai.credits',
      outcome: 'throttled',
      requestId: context.requestId,
      retryAfterSeconds: throttle.retryAfterSeconds,
      source: 'rest',
      statusCode: 429,
    })
    return applyResponseCorrelationHeaders(
      NextResponse.json(
        { error: 'Too many AI credit requests.' },
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

  try {
    const info = await observeCapacity(
      {
        correlationId: context.correlationId,
        operation: 'ai.credits',
        requestId: context.requestId,
        slowThresholdMs: AI_CREDITS_SLOW_THRESHOLD_MS,
        source: 'rest',
      },
      getKeyInfo,
    )
    return applyResponseCorrelationHeaders(NextResponse.json(info), context)
  } catch (err) {
    logSanitizedError('Failed to get AI credit information', err)
    return applyResponseCorrelationHeaders(
      NextResponse.json(
        { error: AI_CREDIT_INFORMATION_UNAVAILABLE_MESSAGE },
        { status: 503 },
      ),
      context,
    )
  }
}
