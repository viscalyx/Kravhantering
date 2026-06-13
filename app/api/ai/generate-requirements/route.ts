import { z } from 'zod'
import {
  type ContentPart,
  generateChatStream,
} from '@/lib/ai/openrouter-client'
import {
  buildSystemPrompt,
  buildUserPrompt,
  type GeneratedRequirement,
  REQUIREMENT_FORMAT_SCHEMA,
  validateGeneratedRequirementsWithMetadata,
} from '@/lib/ai/requirement-prompt'
import { loadTaxonomy } from '@/lib/ai/taxonomy'
import { getRequestSqlServerDataSource } from '@/lib/db'
import {
  AI_PROVIDER_UNAVAILABLE_MESSAGE,
  logSanitizedError,
} from '@/lib/http/safe-errors'
import {
  requirementsMutationPolicy,
  secureMutationRoute,
} from '@/lib/http/secure-mutation-route'
import { ARRAY_INPUT_MAX_ITEMS, localeSchema } from '@/lib/http/validation'
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

const MAX_AI_IMAGE_BYTES = 10 * 1024 * 1024
const MAX_AI_IMAGES = 3
const MAX_AI_INSTRUCTION_LENGTH = 4000
const MAX_AI_MODEL_LENGTH = 100
const MAX_AI_PARAMETER_LENGTH = 100
const MAX_AI_TOPIC_LENGTH = 4000
const AI_GENERATE_RATE_LIMIT = 5
const AI_GENERATE_RATE_WINDOW_MS = 60_000
const AI_GENERATE_SLOW_THRESHOLD_MS = 30_000

function checkAiGenerateThrottle(context: RequestContext) {
  return checkInMemoryThrottle({
    key: [
      'ai.generate-requirements',
      context.actor.source,
      context.actor.id ?? context.actor.hsaId ?? context.correlationId,
    ].join(':'),
    limit: AI_GENERATE_RATE_LIMIT,
    windowMs: AI_GENERATE_RATE_WINDOW_MS,
  })
}

function createAiGenerateThrottleResponse(
  context: RequestContext,
  throttle: ReturnType<typeof checkInMemoryThrottle>,
) {
  recordCapacityEvent({
    correlationId: context.correlationId,
    event: 'capacity.throttled',
    level: 'warn',
    metrics: { throttled: true },
    operation: 'ai.generate-requirements',
    outcome: 'throttled',
    requestId: context.requestId,
    retryAfterSeconds: throttle.retryAfterSeconds,
    source: 'rest',
    statusCode: 429,
  })
  return applyResponseCorrelationHeaders(
    Response.json(
      {
        error: 'Too many AI generation requests. Try again later.',
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

const imageDataUrlSchema = z.string().superRefine((dataUrl, context) => {
  const mimeMatch = dataUrl.match(/^data:([^;]+);base64,/)
  if (
    !mimeMatch ||
    !ALLOWED_IMAGE_MIMES.includes(
      mimeMatch[1] as (typeof ALLOWED_IMAGE_MIMES)[number],
    )
  ) {
    context.addIssue({
      code: 'custom',
      message: 'Unsupported image type. Use PNG, JPEG, GIF or WebP.',
    })
    return
  }

  const base64Data = dataUrl.slice(dataUrl.indexOf(',') + 1)
  const approxBytes = (base64Data.length * 3) / 4
  if (approxBytes > MAX_AI_IMAGE_BYTES) {
    context.addIssue({
      code: 'custom',
      message: 'Image exceeds the 10 MB size limit',
    })
  }
})

const providerPreferencesSchema = z
  .object({
    data_collection: z.enum(['allow', 'deny']).optional(),
    enforce_distillable_text: z.boolean().optional(),
    zdr: z.boolean().optional(),
  })
  .strict()

const aiScopeTypeSchema = z.enum(['requirement_area', 'specification'])

const generateRequirementsSchema = z
  .object({
    customInstruction: z
      .string()
      .trim()
      .max(MAX_AI_INSTRUCTION_LENGTH)
      .optional(),
    images: z
      .array(
        z
          .object({
            dataUrl: imageDataUrlSchema,
          })
          .strict(),
      )
      .max(MAX_AI_IMAGES)
      .optional()
      .default([]),
    locale: localeSchema.optional().default('en'),
    model: z.string().trim().max(MAX_AI_MODEL_LENGTH).optional(),
    providerPreferences: providerPreferencesSchema.optional(),
    reasoningEffort: z.string().trim().max(MAX_AI_MODEL_LENGTH).optional(),
    scopeId: z.number().int().positive().optional(),
    scopeType: aiScopeTypeSchema.optional(),
    supportedParameters: z
      .array(z.string().trim().min(1).max(MAX_AI_PARAMETER_LENGTH))
      .max(ARRAY_INPUT_MAX_ITEMS)
      .optional(),
    topic: z.string().trim().min(1).max(MAX_AI_TOPIC_LENGTH),
  })
  .strict()
  .refine(body => (body.scopeId == null) === (body.scopeType == null), {
    message: 'scopeType and scopeId must be provided together',
    path: ['scopeId'],
  })

type GenerateRequirementsBody = z.infer<typeof generateRequirementsSchema>

export const POST = secureMutationRoute({
  bodySchema: generateRequirementsSchema,
  policy: requirementsMutationPolicy<GenerateRequirementsBody>(({ body }) => ({
    kind: 'generate_requirements',
    scopeId: body.scopeId,
    scopeType: body.scopeType,
  })),
  preParse: ({ context }) => {
    const throttle = checkAiGenerateThrottle(context)
    if (!throttle.allowed) {
      return createAiGenerateThrottleResponse(context, throttle)
    }
  },
  handler: async ({ body, context, db: authorizationDb, request }) => {
    const providerPreferences = body.providerPreferences
    const { images, locale } = body
    const imageBytes = images.reduce((sum, image) => {
      const data = image.dataUrl.slice(image.dataUrl.indexOf(',') + 1)
      return sum + Math.round((data.length * 3) / 4)
    }, 0)

    const db = authorizationDb ?? (await getRequestSqlServerDataSource())

    const taxonomy = await loadTaxonomy(db, locale)
    const systemPrompt = buildSystemPrompt(taxonomy, locale)
    const userPrompt = buildUserPrompt(
      body.topic,
      body.customInstruction,
      locale,
    )

    // Build user message content: text-only or multipart with images
    let userContent: ContentPart[] | string = userPrompt
    if (images.length > 0) {
      const parts: ContentPart[] = [{ text: userPrompt, type: 'text' }]
      for (const img of images) {
        parts.push({ image_url: { url: img.dataUrl }, type: 'image_url' })
      }
      userContent = parts
    }

    const streamStartedAt = Date.now()
    let recordedTerminalEvent = false

    function recordStreamEvent(
      ids: RequestCorrelationIds,
      outcome: 'failure' | 'success',
      statusCode: number,
      stats?: { cost: number; totalTokens: number },
    ) {
      if (recordedTerminalEvent) return
      recordedTerminalEvent = true
      const durationMs = Date.now() - streamStartedAt
      recordCapacityEvent({
        correlationId: ids.correlationId,
        durationMs,
        event:
          outcome === 'success'
            ? 'capacity.operation.completed'
            : 'capacity.operation.failed',
        metrics: {
          cost: stats?.cost,
          image_bytes: imageBytes,
          image_count: images.length,
          token_count: stats?.totalTokens,
        },
        operation: 'ai.generate-requirements',
        outcome,
        requestId: ids.requestId,
        source: 'rest',
        statusCode,
      })
      if (durationMs >= AI_GENERATE_SLOW_THRESHOLD_MS) {
        recordCapacityEvent({
          correlationId: ids.correlationId,
          durationMs,
          event: 'capacity.threshold_exceeded',
          level: 'warn',
          metrics: {
            image_bytes: imageBytes,
            image_count: images.length,
            token_count: stats?.totalTokens,
          },
          operation: 'ai.generate-requirements',
          outcome,
          requestId: ids.requestId,
          source: 'rest',
          statusCode,
        })
      }
    }

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder()
        const supportedParameters = Array.isArray(body.supportedParameters)
          ? body.supportedParameters
          : undefined

        function send(event: string, data: unknown) {
          controller.enqueue(
            encoder.encode(
              `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
            ),
          )
        }

        try {
          for await (const event of generateChatStream({
            format: REQUIREMENT_FORMAT_SCHEMA,
            messages: [
              { content: systemPrompt, role: 'system' },
              { content: userContent, role: 'user' },
            ],
            model: body.model,
            providerPreferences,
            reasoningEffort:
              typeof body.reasoningEffort === 'string'
                ? body.reasoningEffort
                : undefined,
            signal: request.signal,
            supportedParameters,
          })) {
            switch (event.phase) {
              case 'thinking':
                send('thinking', {
                  chunk: event.chunk,
                  thinkingSoFar: event.thinkingSoFar,
                })
                break
              case 'generating':
                send('generating', { chunk: event.chunk })
                break
              case 'done': {
                // Validate taxonomy IDs before sending to client
                let validated = event.rawContent
                try {
                  const parsed = JSON.parse(event.rawContent) as {
                    requirements: GeneratedRequirement[]
                  }
                  if (parsed.requirements) {
                    const validation =
                      validateGeneratedRequirementsWithMetadata(
                        parsed.requirements,
                        taxonomy,
                      )
                    parsed.requirements = validation.requirements
                    validated = JSON.stringify(parsed)
                  }
                } catch {
                  // If parsing fails, send raw content; client will handle the error
                }
                send('done', {
                  model:
                    body.model ?? process.env.NEXT_PUBLIC_DEFAULT_MODEL ?? '',
                  rawContent: validated,
                  stats: event.stats,
                  taxonomy,
                  thinking: event.thinking,
                })
                recordStreamEvent(context, 'success', 200, event.stats)
                break
              }
              case 'error':
                logSanitizedError(
                  'AI requirement generation stream failed',
                  event.cause ?? event.message,
                )
                send('error', { message: AI_PROVIDER_UNAVAILABLE_MESSAGE })
                recordStreamEvent(context, 'failure', 503)
                break
            }
          }
        } catch (err) {
          logSanitizedError('AI requirement generation failed', err)
          send('error', { message: AI_PROVIDER_UNAVAILABLE_MESSAGE })
          recordStreamEvent(context, 'failure', 503)
        } finally {
          controller.close()
        }
      },
    })

    return applyResponseCorrelationHeaders(
      new Response(stream, {
        headers: {
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
          'Content-Type': 'text/event-stream',
        },
      }),
      context,
    )
  },
})
