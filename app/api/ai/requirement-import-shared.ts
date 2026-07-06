import { type RefinementCtx, z } from 'zod'
import type { ContentPart } from '@/lib/ai/openrouter-client'
import {
  DEFAULT_REQUIREMENT_CANDIDATE_COUNT,
  getPromptMessage,
  MAX_REQUIREMENT_CANDIDATE_COUNT,
  MIN_REQUIREMENT_CANDIDATE_COUNT,
} from '@/lib/ai/requirement-prompt'
import {
  type AiSafetyBlockedStep,
  type AiSafetyDecision,
  type AiSafetyScreenPart,
  getAiSafetyRuleTypeName,
  recordAiSafetyBlock,
  screenAiInputDetailed,
} from '@/lib/ai/safety'
import type { SqlServerDatabase } from '@/lib/db'
import {
  AI_PROVIDER_UNAVAILABLE_MESSAGE,
  logSanitizedError,
} from '@/lib/http/safe-errors'
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

export function formatAiSafetyBlockedMessage(
  locale: RequirementImportLocale,
  messageKey: 'inputSafetyBlocked' | 'outputSafetyBlocked',
  decision: AiSafetyDecision,
): string {
  const ruleType = decision.primaryRuleId
    ? getAiSafetyRuleTypeName(decision.primaryRuleId, locale)
    : locale === 'sv'
      ? 'AI-säkerhetsregel'
      : 'AI safety rule'
  return getPromptMessage(locale, ['ai', messageKey]).replace(
    '{ruleType}',
    ruleType,
  )
}

export const providerPreferencesSchema = z
  .object({
    data_collection: z.enum(['allow', 'deny']).optional(),
    enforce_distillable_text: z.boolean().optional(),
    zdr: z.boolean().optional(),
  })
  .strict()

type RequirementImportLocale = z.infer<typeof localeSchema>

function requirementImportLocale(body: {
  locale?: RequirementImportLocale
}): RequirementImportLocale {
  return body.locale ?? 'en'
}

export async function guardAiInput(args: {
  blockedStep: AiSafetyBlockedStep
  context: RequestContext
  db: SqlServerDatabase
  locale: RequirementImportLocale
  onBlockedInput: () => void
  onSafetyFilterFailure: (error: unknown) => Response
  operation: string
  parts: readonly AiSafetyScreenPart[]
  request: Request
}): Promise<Response | null> {
  let inputSafetyScreening: Awaited<ReturnType<typeof screenAiInputDetailed>>
  try {
    inputSafetyScreening = await screenAiInputDetailed(args.db, args.parts)
  } catch (error) {
    return args.onSafetyFilterFailure(error)
  }

  if (inputSafetyScreening.decision.allowed) return null

  try {
    await recordAiSafetyBlock({
      blockedStep: args.blockedStep,
      context: args.context,
      db: args.db,
      direction: 'input',
      event: 'ai.input_safety.blocked',
      operation: args.operation,
      request: args.request,
      screening: inputSafetyScreening,
    })
  } catch (error) {
    logSanitizedError(
      'AI requirement import safety block logging failed',
      error,
    )
  }
  args.onBlockedInput()

  return applyResponseCorrelationHeaders(
    Response.json(
      {
        error: formatAiSafetyBlockedMessage(
          args.locale,
          'inputSafetyBlocked',
          inputSafetyScreening.decision,
        ),
      },
      { status: 400 },
    ),
    args.context,
  )
}

export const imageDataUrlSchema = z.string()

const BASE64_PAYLOAD_PATTERN =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/

function normalizeBase64Payload(base64Data: string): string | null {
  if (base64Data.length === 0 || /\s/.test(base64Data)) return null
  const remainder = base64Data.length % 4
  if (remainder === 1) return null
  const normalized =
    remainder === 0
      ? base64Data
      : base64Data.padEnd(base64Data.length + 4 - remainder, '=')
  return BASE64_PAYLOAD_PATTERN.test(normalized) ? normalized : null
}

function countBase64Bytes(base64Data: string): number {
  const paddingBytes = base64Data.endsWith('==')
    ? 2
    : base64Data.endsWith('=')
      ? 1
      : 0
  return (base64Data.length / 4) * 3 - paddingBytes
}

function validateImageDataUrl(
  dataUrl: string,
  context: RefinementCtx,
  locale: RequirementImportLocale,
  path: Array<number | string>,
): void {
  const mimeMatch = dataUrl.match(/^data:([^;]+);base64,/)
  if (
    !mimeMatch ||
    !ALLOWED_IMAGE_MIMES.includes(
      mimeMatch[1] as (typeof ALLOWED_IMAGE_MIMES)[number],
    )
  ) {
    context.addIssue({
      code: 'custom',
      message: getPromptMessage(locale, ['ai', 'imageSchemaErrorType']),
      path,
    })
    return
  }

  const base64Data = dataUrl.slice(dataUrl.indexOf(',') + 1)
  const normalizedBase64Data = normalizeBase64Payload(base64Data)
  if (!normalizedBase64Data) {
    context.addIssue({
      code: 'custom',
      message: getPromptMessage(locale, ['ai', 'imageSchemaErrorBase64']),
      path,
    })
    return
  }

  if (countBase64Bytes(normalizedBase64Data) > MAX_AI_IMAGE_BYTES) {
    context.addIssue({
      code: 'custom',
      message: getPromptMessage(locale, ['ai', 'imageSchemaErrorSize']),
      path,
    })
  }
}

export function validateRequirementImportImages(
  body: {
    images?: Array<{ dataUrl: string }>
    locale?: RequirementImportLocale
  },
  context: RefinementCtx,
): void {
  const locale = requirementImportLocale(body)
  for (const [index, image] of (body.images ?? []).entries()) {
    validateImageDataUrl(image.dataUrl, context, locale, [
      'images',
      index,
      'dataUrl',
    ])
  }
}

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

export function validateRequirementImportScope(
  body: {
    areaId?: number
    locale?: RequirementImportLocale
    mode: 'library' | 'specification-local'
    specificationId?: number
  },
  context: RefinementCtx,
): void {
  if (isValidRequirementImportScope(body)) return
  context.addIssue({
    code: 'custom',
    message: getPromptMessage(requirementImportLocale(body), [
      'ai',
      'invalidRequirementImportScope',
    ]),
    path: ['mode'],
  })
}

export const aiRequirementImportScopeBaseSchema = z
  .object({
    areaId: positiveIntegerSchema.optional(),
    mode: aiRequirementImportModeSchema,
    specificationId: positiveIntegerSchema.optional(),
  })
  .strict()

export const aiRequirementImportScopeSchema =
  aiRequirementImportScopeBaseSchema.superRefine(validateRequirementImportScope)

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
