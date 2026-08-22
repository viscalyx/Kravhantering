import { type RefinementCtx, z } from 'zod'
import { AiRunProfileResolutionError } from '@/lib/ai/profile-resolver'
import {
  DEFAULT_REQUIREMENT_CANDIDATE_COUNT,
  getPromptMessage,
  MAX_REQUIREMENT_CANDIDATE_COUNT,
  MIN_REQUIREMENT_CANDIDATE_COUNT,
  SAFE_AI_TECHNICAL_CODE,
} from '@/lib/ai/requirement-prompt'
import type {
  AiRunFailure,
  AiTaskContentPart,
  AiUsageMetric,
} from '@/lib/ai/run-contracts'
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
import type { McpImportDestinationRef } from '@/lib/requirements/import-service'

const ALLOWED_IMAGE_MIMES = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
] as const

export const MAX_AI_IMAGE_BYTES = 10 * 1024 * 1024
export const MAX_AI_IMAGES = 3
export const MAX_AI_IMAGE_DATA_URL_LENGTH =
  Math.ceil(MAX_AI_IMAGE_BYTES / 3) * 4 + 'data:image/jpeg;base64,'.length
export const MAX_AI_INSTRUCTION_LENGTH = 4000
export const MAX_AI_NEED_LENGTH = 4000
export const AI_GENERATE_RATE_LIMIT = 5
export const AI_GENERATE_RATE_WINDOW_MS = 60_000
export const AI_GENERATE_SLOW_THRESHOLD_MS = 30_000
export const AI_RUN_REQUEST_DEADLINE_MS = 5 * 60 * 1_000

export function aiUsageMetricValue<T>(metric: AiUsageMetric<T>): T | null {
  return metric.status === 'unavailable' ? null : metric.value
}

export function aiRunProfileError(
  error: unknown,
  locale: RequirementImportLocale,
): {
  code: 'ai_profile_blocked' | 'ai_profile_missing' | 'ai_profile_suspended'
  message: string
} | null {
  if (!(error instanceof AiRunProfileResolutionError)) return null
  if (error.code === 'run_type_unsupported') return null
  const reason =
    error.code === 'profile_missing'
      ? 'missing'
      : error.code === 'profile_suspended'
        ? 'suspended'
        : 'blocked'
  return {
    code: `ai_profile_${reason}`,
    message: getPromptMessage(locale, ['ai', 'profileUnavailable', reason]),
  }
}

export { SAFE_AI_TECHNICAL_CODE }

export type AiProviderErrorCode =
  | 'ai_provider_invalid_response'
  | 'ai_provider_rate_limited'
  | 'ai_provider_unavailable'

export interface AiProviderPublicError {
  code: AiProviderErrorCode
  message: string
  technicalCode?: string
}

const PROVIDER_ERROR_MESSAGE_KEYS = {
  adapter_failure: 'adapterFailure',
  authentication_failed: 'authenticationFailed',
  capability_mismatch: 'capabilityMismatch',
  connection_unavailable: 'connectionUnavailable',
  deadline_exceeded: 'deadlineExceeded',
  invalid_response: 'invalidResponse',
  rate_limited: 'rateLimited',
  request_rejected: 'requestRejected',
} as const satisfies Record<AiRunFailure['category'], string>

export function aiRunFailureError(
  failure: Readonly<AiRunFailure>,
  locale: RequirementImportLocale,
): AiProviderPublicError {
  const code: AiProviderErrorCode =
    failure.category === 'rate_limited'
      ? 'ai_provider_rate_limited'
      : failure.category === 'invalid_response'
        ? 'ai_provider_invalid_response'
        : 'ai_provider_unavailable'
  const technicalCode =
    failure.diagnosticCode &&
    SAFE_AI_TECHNICAL_CODE.test(failure.diagnosticCode)
      ? failure.diagnosticCode
      : undefined
  return {
    code,
    message: getPromptMessage(locale, [
      'ai',
      'providerErrors',
      PROVIDER_ERROR_MESSAGE_KEYS[failure.category],
    ]),
    ...(technicalCode ? { technicalCode } : {}),
  }
}

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

export const imageDataUrlSchema = z.string().max(MAX_AI_IMAGE_DATA_URL_LENGTH)

const BASE64_PAYLOAD_PATTERN =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/
const BASE64_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

function canonicalizeBase64Payload(base64Data: string): string | null {
  if (base64Data.length === 0 || /\s/.test(base64Data)) return null
  const remainder = base64Data.length % 4
  if (remainder === 1) return null
  const normalized =
    remainder === 0
      ? base64Data
      : base64Data.padEnd(base64Data.length + 4 - remainder, '=')
  if (!BASE64_PAYLOAD_PATTERN.test(normalized)) return null

  const padBitIndex = normalized.endsWith('==')
    ? normalized.length - 3
    : normalized.endsWith('=')
      ? normalized.length - 2
      : -1
  if (padBitIndex === -1) return normalized

  const sextet = BASE64_ALPHABET.indexOf(normalized[padBitIndex])
  const canonicalSextet = normalized.endsWith('==')
    ? sextet & 0b11_0000
    : sextet & 0b11_1100
  if (sextet === canonicalSextet) return normalized

  return `${normalized.slice(0, padBitIndex)}${BASE64_ALPHABET[canonicalSextet]}${normalized.slice(padBitIndex + 1)}`
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
): string | null {
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
    return null
  }

  const base64Data = dataUrl.slice(dataUrl.indexOf(',') + 1)
  const canonicalBase64Data = canonicalizeBase64Payload(base64Data)
  if (!canonicalBase64Data) {
    context.addIssue({
      code: 'custom',
      message: getPromptMessage(locale, ['ai', 'imageSchemaErrorBase64']),
      path,
    })
    return null
  }

  if (countBase64Bytes(canonicalBase64Data) > MAX_AI_IMAGE_BYTES) {
    context.addIssue({
      code: 'custom',
      message: getPromptMessage(locale, ['ai', 'imageSchemaErrorSize']),
      path,
    })
  }
  return canonicalBase64Data
}

export function validateRequirementImportImages(
  body: {
    images?: Array<{ dataUrl: string }>
    locale?: RequirementImportLocale
  },
  context: RefinementCtx,
): void {
  const locale = requirementImportLocale(body)
  const uniquePayloads = new Set<string>()
  for (const [index, image] of (body.images ?? []).entries()) {
    const path = ['images', index, 'dataUrl']
    const canonicalPayload = validateImageDataUrl(
      image.dataUrl,
      context,
      locale,
      path,
    )
    if (canonicalPayload === null) continue
    if (uniquePayloads.has(canonicalPayload)) {
      context.addIssue({
        code: 'custom',
        message: getPromptMessage(locale, ['ai', 'imageSchemaErrorDuplicate']),
        path,
      })
      continue
    }
    uniquePayloads.add(canonicalPayload)
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

export function requirementImportDestination(body: {
  areaId?: number
  mode: 'library' | 'specification-local'
  specificationId?: number
}): McpImportDestinationRef {
  if (body.mode === 'library' && body.areaId != null) {
    return { areaId: body.areaId, kind: 'requirements_library' }
  }
  if (body.mode === 'specification-local' && body.specificationId != null) {
    return {
      kind: 'requirements_specification',
      specificationId: body.specificationId,
    }
  }
  throw new Error('Invalid requirement import scope')
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
  return createAiErrorStreamResponse(
    context,
    {
      code: 'ai_provider_unavailable',
      message: AI_PROVIDER_UNAVAILABLE_MESSAGE,
    },
    recordFailure,
  )
}

export function createAiErrorStreamResponse(
  context: RequestCorrelationIds,
  error: {
    code:
      | 'ai_profile_blocked'
      | 'ai_profile_missing'
      | 'ai_profile_suspended'
      | 'ai_provider_invalid_response'
      | 'ai_provider_rate_limited'
      | 'ai_provider_unavailable'
    message: string
    technicalCode?: string
  },
  recordFailure: (statusCode: number) => void,
) {
  const statusCode = error.code === 'ai_provider_rate_limited' ? 429 : 503
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder()
      controller.enqueue(
        encoder.encode(`event: error\ndata: ${JSON.stringify(error)}\n\n`),
      )
      recordFailure(statusCode)
      controller.close()
    },
  })

  return applyResponseCorrelationHeaders(
    new Response(stream, {
      headers: {
        Connection: 'keep-alive',
        'Content-Type': 'text/event-stream',
      },
      status: statusCode,
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

export function toAiTaskContent(
  text: string,
  images: Array<{ dataUrl: string }>,
): readonly AiTaskContentPart[] {
  const parts: AiTaskContentPart[] = [{ text, type: 'text' }]
  for (const image of images) {
    const commaIndex = image.dataUrl.indexOf(',')
    const mediaType = image.dataUrl.slice(5, image.dataUrl.indexOf(';'))
    parts.push({
      data: new Uint8Array(
        Buffer.from(image.dataUrl.slice(commaIndex + 1), 'base64'),
      ),
      mediaType,
      type: 'image',
    })
  }
  return Object.freeze(parts)
}

export const requirementCandidateCountSchema = z
  .number()
  .int()
  .min(MIN_REQUIREMENT_CANDIDATE_COUNT)
  .max(MAX_REQUIREMENT_CANDIDATE_COUNT)
  .optional()
  .default(DEFAULT_REQUIREMENT_CANDIDATE_COUNT)
