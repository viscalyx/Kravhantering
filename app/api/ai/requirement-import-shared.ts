import { z } from 'zod'
import type { ContentPart } from '@/lib/ai/openrouter-client'
import {
  DEFAULT_REQUIREMENT_CANDIDATE_COUNT,
  getPromptMessage,
  MAX_REQUIREMENT_CANDIDATE_COUNT,
  MIN_REQUIREMENT_CANDIDATE_COUNT,
} from '@/lib/ai/requirement-prompt'
import { AI_PROVIDER_UNAVAILABLE_MESSAGE } from '@/lib/http/safe-errors'
import { localeSchema, positiveIntegerSchema } from '@/lib/http/validation'
import { recordCapacityEvent } from '@/lib/observability/capacity'
import {
  applyResponseCorrelationHeaders,
  type RequestCorrelationIds,
} from '@/lib/observability/request-ids'
import { checkInMemoryThrottle } from '@/lib/observability/throttle'
import type { RequestContext } from '@/lib/requirements/auth'

const ALLOWED_IMAGE_MIMES = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
] as const

export const MAX_AI_IMAGE_BYTES = 10 * 1024 * 1024
export const MAX_AI_IMAGES = 3
export const MAX_AI_INSTRUCTION_LENGTH = 4000
export const MAX_AI_MODEL_LENGTH = 100
export const MAX_AI_NEED_LENGTH = 4000
export const AI_GENERATE_RATE_LIMIT = 5
export const AI_GENERATE_RATE_WINDOW_MS = 60_000
export const AI_GENERATE_SLOW_THRESHOLD_MS = 30_000

export const providerPreferencesSchema = z
  .object({
    data_collection: z.enum(['allow', 'deny']).optional(),
    enforce_distillable_text: z.boolean().optional(),
    zdr: z.boolean().optional(),
  })
  .strict()

export const imageDataUrlSchema = z.string().superRefine((dataUrl, context) => {
  const mimeMatch = dataUrl.match(/^data:([^;]+);base64,/)
  if (
    !mimeMatch ||
    !ALLOWED_IMAGE_MIMES.includes(
      mimeMatch[1] as (typeof ALLOWED_IMAGE_MIMES)[number],
    )
  ) {
    context.addIssue({
      code: 'custom',
      message: getPromptMessage('en', ['ai', 'imageSchemaErrorType']),
    })
    return
  }

  const base64Data = dataUrl.slice(dataUrl.indexOf(',') + 1)
  const approxBytes = (base64Data.length * 3) / 4
  if (approxBytes > MAX_AI_IMAGE_BYTES) {
    context.addIssue({
      code: 'custom',
      message: getPromptMessage('en', ['ai', 'imageSchemaErrorSize']),
    })
  }
})

export const aiRequirementImportModeSchema = z.enum([
  'library',
  'specification-local',
])

export function isValidRequirementImportScope(body: {
  areaId?: number
  mode: 'library' | 'specification-local'
  specificationId?: number
}) {
  return body.mode === 'library'
    ? body.areaId != null && body.specificationId == null
    : body.specificationId != null && body.areaId == null
}

export const requirementImportScopeValidation = {
  message: getPromptMessage('en', ['ai', 'invalidRequirementImportScope']),
  path: ['mode'],
}

export const aiRequirementImportScopeBaseSchema = z
  .object({
    areaId: positiveIntegerSchema.optional(),
    mode: aiRequirementImportModeSchema,
    specificationId: positiveIntegerSchema.optional(),
  })
  .strict()

export const aiRequirementImportScopeSchema =
  aiRequirementImportScopeBaseSchema.refine(
    isValidRequirementImportScope,
    requirementImportScopeValidation,
  )

export const aiRequirementImportBaseBodySchema =
  aiRequirementImportScopeBaseSchema.extend({
    locale: localeSchema.optional().default('en'),
    model: z.string().trim().max(MAX_AI_MODEL_LENGTH).optional(),
    providerPreferences: providerPreferencesSchema.optional(),
    reasoningEffort: z.string().trim().max(MAX_AI_MODEL_LENGTH).optional(),
  })

export function requirementImportScopeAction(body: {
  areaId?: number
  mode: 'library' | 'specification-local'
  specificationId?: number
}) {
  return body.mode === 'library'
    ? {
        kind: 'generate_requirements' as const,
        scopeId: body.areaId,
        scopeType: 'requirement_area' as const,
      }
    : {
        kind: 'generate_requirements' as const,
        scopeId: body.specificationId,
        scopeType: 'specification' as const,
      }
}

export function checkAiRequirementImportThrottle(
  context: RequestContext,
  operation: string,
) {
  return checkInMemoryThrottle({
    key: [
      operation,
      context.actor.source,
      context.actor.id ?? context.actor.hsaId ?? context.correlationId,
    ].join(':'),
    limit: AI_GENERATE_RATE_LIMIT,
    windowMs: AI_GENERATE_RATE_WINDOW_MS,
  })
}

export function createAiRequirementImportThrottleResponse(
  context: RequestContext,
  operation: string,
  throttle: ReturnType<typeof checkInMemoryThrottle>,
) {
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
    Response.json(
      {
        error: 'Too many AI requests. Try again later.',
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

export function createUnavailableAiStreamResponse(
  context: RequestCorrelationIds,
  recordFailure: () => void,
) {
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder()
      controller.enqueue(
        encoder.encode(
          `event: error\ndata: ${JSON.stringify({
            message: AI_PROVIDER_UNAVAILABLE_MESSAGE,
          })}\n\n`,
        ),
      )
      recordFailure()
      controller.close()
    },
  })

  return applyResponseCorrelationHeaders(
    new Response(stream, {
      headers: {
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'Content-Type': 'text/event-stream',
      },
      status: 503,
    }),
    context,
  )
}

export function countImageBytes(images: Array<{ dataUrl: string }>): number {
  return images.reduce((sum, image) => {
    const data = image.dataUrl.slice(image.dataUrl.indexOf(',') + 1)
    return sum + Math.round((data.length * 3) / 4)
  }, 0)
}

export function withImages(
  text: string,
  images: Array<{ dataUrl: string }>,
): ContentPart[] | string {
  if (images.length === 0) return text

  const parts: ContentPart[] = [{ text, type: 'text' }]
  for (const image of images) {
    parts.push({ image_url: { url: image.dataUrl }, type: 'image_url' })
  }
  return parts
}

export const requirementCandidateCountSchema = z
  .number()
  .int()
  .min(MIN_REQUIREMENT_CANDIDATE_COUNT)
  .max(MAX_REQUIREMENT_CANDIDATE_COUNT)
  .optional()
  .default(DEFAULT_REQUIREMENT_CANDIDATE_COUNT)
