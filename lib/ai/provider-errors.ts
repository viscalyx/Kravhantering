export const AI_PROVIDER_RESPONSE_LIMITS = {
  errorBodyBytes: 16 * 1024,
  jsonBodyBytes: 4 * 1024 * 1024,
  sseAccumulatedBytes: 4 * 1024 * 1024,
  sseFrameBytes: 256 * 1024,
} as const

export type AiProviderErrorCode =
  | 'ai_provider_configuration_error'
  | 'ai_provider_invalid_response'
  | 'ai_provider_rate_limited'
  | 'ai_provider_response_read_failed'
  | 'ai_provider_response_too_large'
  | 'ai_provider_timeout'
  | 'ai_provider_unavailable'

export type AiProviderOperation =
  | 'chat.completions'
  | 'credits'
  | 'key.info'
  | 'models.list'

export interface AiProviderDiagnosticContext {
  correlationId?: string
  modelProvider?: string
  requestId?: string
}

export type AiProviderContentTypeCategory =
  | 'event-stream'
  | 'json'
  | 'missing'
  | 'unexpected'

export interface AiProviderErrorMetadata {
  contentTypeCategory?: AiProviderContentTypeCategory
  observedBytes?: number
  providerCode?: string
  truncated?: boolean
  upstreamRequestId?: string
}

interface AiProviderErrorOptions extends AiProviderDiagnosticContext {
  code: AiProviderErrorCode
  metadata?: AiProviderErrorMetadata
  operation: AiProviderOperation
  status?: number
}

const AI_PROVIDER_ERROR_MESSAGES: Record<AiProviderErrorCode, string> = {
  ai_provider_configuration_error: 'AI provider configuration is invalid',
  ai_provider_invalid_response: 'AI provider returned an invalid response',
  ai_provider_rate_limited: 'AI provider rate limit reached',
  ai_provider_response_read_failed: 'AI provider response could not be read',
  ai_provider_response_too_large: 'AI provider response was too large',
  ai_provider_timeout: 'AI provider request timed out',
  ai_provider_unavailable: 'AI provider is unavailable',
}

const recordedDiagnostics = new WeakSet<AiProviderError>()
const SAFE_IDENTIFIER_PATTERN = /^[A-Za-z0-9._:/-]{1,128}$/
const SAFE_PROVIDER_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/
const SAFE_PROVIDER_CODE_PATTERN = /^[A-Za-z0-9._:-]{1,64}$/

function boundedIdentifier(value: unknown): string | undefined {
  return typeof value === 'string' && SAFE_IDENTIFIER_PATTERN.test(value)
    ? value
    : undefined
}

function boundedProvider(value: unknown): string | undefined {
  return typeof value === 'string' && SAFE_PROVIDER_PATTERN.test(value)
    ? value
    : undefined
}

function boundedProviderCode(value: unknown): string | undefined {
  return typeof value === 'string' && SAFE_PROVIDER_CODE_PATTERN.test(value)
    ? value
    : undefined
}

function boundedStatus(value: unknown): number | undefined {
  return typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 100 &&
    value <= 599
    ? value
    : undefined
}

function boundedObservedBytes(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? value
    : undefined
}

export class AiProviderError extends Error {
  readonly code: AiProviderErrorCode
  readonly correlationId?: string
  readonly gateway = 'openrouter'
  readonly metadata: AiProviderErrorMetadata
  readonly modelProvider?: string
  readonly operation: AiProviderOperation
  readonly requestId?: string
  readonly status?: number

  constructor(options: AiProviderErrorOptions) {
    super(AI_PROVIDER_ERROR_MESSAGES[options.code])
    this.name = 'AiProviderError'
    this.code = options.code
    this.correlationId = boundedIdentifier(options.correlationId)
    this.modelProvider = boundedProvider(options.modelProvider)
    this.operation = options.operation
    this.requestId = boundedIdentifier(options.requestId)
    this.status = boundedStatus(options.status)
    this.metadata = {
      contentTypeCategory: options.metadata?.contentTypeCategory,
      observedBytes: boundedObservedBytes(options.metadata?.observedBytes),
      providerCode: boundedProviderCode(options.metadata?.providerCode),
      truncated:
        typeof options.metadata?.truncated === 'boolean'
          ? options.metadata.truncated
          : undefined,
      upstreamRequestId: boundedIdentifier(options.metadata?.upstreamRequestId),
    }
  }
}

export class AiProviderCallerCancelledError extends Error {
  constructor() {
    super('AI provider request cancelled')
    this.name = 'AiProviderCallerCancelledError'
  }
}

export function isAiProviderError(error: unknown): error is AiProviderError {
  return error instanceof AiProviderError
}

export function isAiProviderCallerCancelledError(
  error: unknown,
): error is AiProviderCallerCancelledError {
  return error instanceof AiProviderCallerCancelledError
}

export function classifyAiProviderStatus(status: number): AiProviderErrorCode {
  if (status === 429) return 'ai_provider_rate_limited'
  if (status === 408 || status === 504) return 'ai_provider_timeout'
  if (status >= 400 && status < 500) {
    return 'ai_provider_configuration_error'
  }
  return 'ai_provider_unavailable'
}

export function createAiProviderError(
  options: AiProviderErrorOptions,
): AiProviderError {
  return new AiProviderError(options)
}

export function recordAiProviderError(error: AiProviderError): void {
  if (recordedDiagnostics.has(error)) return
  recordedDiagnostics.add(error)
  const payload = {
    channel: 'ai-provider-observability',
    event: 'ai_provider.request_failed',
    code: error.code,
    gateway: error.gateway,
    operation: error.operation,
    ...(error.modelProvider ? { model_provider: error.modelProvider } : {}),
    ...(error.status ? { upstream_status: error.status } : {}),
    ...(error.requestId ? { request_id: error.requestId } : {}),
    ...(error.correlationId ? { correlation_id: error.correlationId } : {}),
    ...(error.metadata.upstreamRequestId
      ? { upstream_request_id: error.metadata.upstreamRequestId }
      : {}),
    ...(error.metadata.providerCode
      ? { provider_code: error.metadata.providerCode }
      : {}),
    ...(error.metadata.contentTypeCategory
      ? { content_type_category: error.metadata.contentTypeCategory }
      : {}),
    ...(error.metadata.observedBytes !== undefined
      ? { observed_byte_count: error.metadata.observedBytes }
      : {}),
    ...(error.metadata.truncated !== undefined
      ? { truncated: error.metadata.truncated }
      : {}),
  }

  // eslint-disable-next-line no-console
  console.error(JSON.stringify(payload))
}

export function normalizeAiProviderError(
  error: unknown,
  fallback: Omit<AiProviderErrorOptions, 'code'> & {
    code?: AiProviderErrorCode
  },
): AiProviderError {
  const providerError = isAiProviderError(error)
    ? error
    : createAiProviderError({
        ...fallback,
        code: fallback.code ?? 'ai_provider_unavailable',
      })
  recordAiProviderError(providerError)
  return providerError
}

export function aiProviderErrorPayload(error: AiProviderError): {
  code: AiProviderErrorCode
  error: string
} {
  return { code: error.code, error: error.message }
}

export function aiProviderStreamError(error: AiProviderError): {
  code: AiProviderErrorCode
  message: string
  phase: 'error'
} {
  return { code: error.code, message: error.message, phase: 'error' }
}

export function getAiProviderContentTypeCategory(
  contentType: string | null,
): AiProviderContentTypeCategory {
  if (!contentType) return 'missing'
  const mediaType = contentType.split(';', 1)[0]?.trim().toLowerCase()
  if (mediaType === 'text/event-stream') return 'event-stream'
  if (mediaType === 'application/json' || mediaType?.endsWith('+json')) {
    return 'json'
  }
  return 'unexpected'
}

export function getSafeUpstreamRequestId(headers: Headers): string | undefined {
  return boundedIdentifier(
    headers.get('x-request-id') ?? headers.get('x-openrouter-request-id'),
  )
}

export function getSafeProviderCode(value: unknown): string | undefined {
  if (!value || typeof value !== 'object') return undefined
  const record = value as Record<string, unknown>
  const nested =
    record.error && typeof record.error === 'object'
      ? (record.error as Record<string, unknown>)
      : undefined
  return boundedProviderCode(record.code) ?? boundedProviderCode(nested?.code)
}
