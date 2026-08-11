import {
  AI_PROVIDER_RESPONSE_LIMITS,
  AiProviderCallerCancelledError,
  type AiProviderError,
  type AiProviderErrorCode,
  type AiProviderErrorMetadata,
  type AiProviderOperation,
  aiProviderStreamError,
  createAiProviderError,
  getAiProviderContentTypeCategory,
  getSafeUpstreamRequestId,
  isAiProviderError,
  recordAiProviderError,
} from '@/lib/ai/provider-errors'
import {
  readAiProviderErrorResponse,
  readAiProviderJson,
} from '@/lib/ai/provider-response'

export { AiProviderError } from '@/lib/ai/provider-errors'

/**
 * OpenRouter API client for AI requirement generation.
 * Uses the OpenAI-compatible chat completions API with reasoning support.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OpenRouterModel {
  contextLength: number
  id: string
  modality?: string
  name: string
  pricing: { completion: string; prompt: string; reasoning: string }
  provider: string
  supportedParameters: string[]
}

export interface OpenRouterRequestContext {
  correlationId?: string
  modelProvider?: string
  requestId?: string
}

export interface GenerationStats {
  completionTokens: number
  cost: number
  promptTokens: number
  reasoningTokens: number
  totalTokens: number
}

interface ReasoningDetail {
  summary?: unknown
  text?: unknown
  type?: unknown
}

export type StreamEvent =
  | { chunk: string; phase: 'thinking'; thinkingSoFar: string }
  | { chunk: string; phase: 'generating' }
  | {
      phase: 'done'
      rawContent: string
      stats: GenerationStats
      thinking: string
    }
  | { code: AiProviderErrorCode; message: string; phase: 'error' }

export interface NonStreamingResult<T> {
  content: T
  stats: GenerationStats
  thinking: string
}

export interface TextContentPart {
  text: string
  type: 'text'
}

export interface ImageContentPart {
  image_url: { detail?: string; url: string }
  type: 'image_url'
}

export type ContentPart = ImageContentPart | TextContentPart

interface ChatMessage {
  content: ContentPart[] | string
  role: 'assistant' | 'system' | 'user'
}

export interface ProviderPreferences {
  data_collection?: 'allow' | 'deny'
  enforce_distillable_text?: boolean
  zdr?: boolean
}

interface GenerateOptions {
  correlationId?: string
  format?: Record<string, unknown>
  messages: ChatMessage[]
  model?: string
  /** OpenRouter provider-level data-policy preferences */
  providerPreferences?: ProviderPreferences
  /** Reasoning effort level (default: 'high'). Use 'none' to disable reasoning. */
  reasoningEffort?: string
  requestId?: string
  signal?: AbortSignal
  /** Model capabilities from the server catalog. Required when format is supplied. */
  supportedParameters?: string[]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getApiKey(
  operation: AiProviderOperation,
  options: Pick<GenerateOptions, 'correlationId' | 'requestId'> = {},
): string {
  const key = process.env.OPENROUTER_API_KEY
  if (!key) {
    const error = createAiProviderError({
      ...options,
      code: 'ai_provider_configuration_error',
      operation,
    })
    recordAiProviderError(error)
    throw error
  }
  return key
}

export function getDefaultModel(): string {
  return process.env.NEXT_PUBLIC_DEFAULT_MODEL || 'anthropic/claude-sonnet-4'
}

const OPENROUTER_BASE = 'https://openrouter.ai/api/v1'

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function hasOptionalFiniteNumber(
  value: Record<string, unknown>,
  key: string,
): boolean {
  return (
    value[key] === undefined ||
    (typeof value[key] === 'number' && Number.isFinite(value[key]))
  )
}

function hasOptionalFiniteNumberOrNull(
  value: Record<string, unknown>,
  key: string,
): boolean {
  return value[key] === null || hasOptionalFiniteNumber(value, key)
}

function throwInvalidProviderResponse(
  operation: AiProviderOperation,
  context: OpenRouterRequestContext,
  status?: number,
): never {
  const error = createAiProviderError({
    ...context,
    code: 'ai_provider_invalid_response',
    operation,
    status,
  })
  recordAiProviderError(error)
  throw error
}

/**
 * Apply the best response_format strategy based on the model's capabilities.
 * - structured_outputs → json_schema (strict schema enforcement)
 * - otherwise → json_object (basic JSON mode, all eligible models support response_format)
 */
function applyResponseFormat(
  body: Record<string, unknown>,
  schema: Record<string, unknown>,
  supportedParameters: string[],
): void {
  if (supportedParameters.includes('structured_outputs')) {
    body.response_format = {
      json_schema: {
        name: 'requirements',
        schema,
        strict: true,
      },
      type: 'json_schema',
    }
  } else {
    body.response_format = { type: 'json_object' }
  }
}

function applyKnownResponseFormat(
  body: Record<string, unknown>,
  schema: Record<string, unknown>,
  supportedParameters?: string[],
): void {
  if (!supportedParameters) {
    throw new Error(
      'OpenRouter model capabilities are required for formatted responses',
    )
  }
  applyResponseFormat(body, schema, supportedParameters)
}

function readReasoningDetailsText(value: unknown): string {
  if (!Array.isArray(value)) return ''
  return value
    .map(detail => {
      if (!detail || typeof detail !== 'object') return ''
      const { summary, text } = detail as ReasoningDetail
      if (typeof text === 'string') return text
      if (typeof summary === 'string') return summary
      return ''
    })
    .join('')
}

function readReasoningText(input: {
  reasoning?: unknown
  reasoning_details?: unknown
}): string {
  const reasoningDetails = readReasoningDetailsText(input.reasoning_details)
  if (reasoningDetails) return reasoningDetails
  const reasoning = typeof input.reasoning === 'string' ? input.reasoning : ''
  return reasoning
}

// ---------------------------------------------------------------------------
// Non-streaming chat (for MCP server)
// ---------------------------------------------------------------------------

export async function generateChat<T>(
  options: GenerateOptions,
): Promise<NonStreamingResult<T>> {
  const operation = 'chat.completions' as const
  const diagnosticContext = {
    correlationId: options.correlationId,
    modelProvider: options.model?.split('/', 1)[0],
    requestId: options.requestId,
  }
  const apiKey = getApiKey(operation, options)
  const model = options.model || getDefaultModel()

  const effort = options.reasoningEffort || 'high'
  const body: Record<string, unknown> = {
    messages: options.messages,
    model,
    reasoning: effort === 'none' ? { enabled: false } : { effort },
    stream: false,
  }

  if (options.format) {
    applyKnownResponseFormat(body, options.format, options.supportedParameters)
  }

  if (options.providerPreferences) {
    body.provider = options.providerPreferences
  }

  // Always enforce a 120 s timeout. When the caller also provides a signal,
  // wire it so that either the timeout or the caller's abort cancels the fetch.
  const DEFAULT_TIMEOUT_MS = 120_000
  const childController = new AbortController()
  let timeoutTriggered = false
  let callerAbortTriggered = false
  const timeoutId = setTimeout(() => {
    timeoutTriggered = true
    childController.abort()
  }, DEFAULT_TIMEOUT_MS)

  const onCallerAbort = (): void => {
    callerAbortTriggered = true
    childController.abort()
  }
  if (options.signal) {
    if (options.signal.aborted) {
      onCallerAbort()
    } else {
      options.signal.addEventListener('abort', onCallerAbort, { once: true })
    }
  }

  let response: Response
  try {
    response = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
      body: JSON.stringify(body),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      method: 'POST',
      signal: childController.signal,
    })
  } catch {
    clearTimeout(timeoutId)
    options.signal?.removeEventListener('abort', onCallerAbort)
    if (callerAbortTriggered) throw new AiProviderCallerCancelledError()
    const error = createAiProviderError({
      ...diagnosticContext,
      code: timeoutTriggered
        ? 'ai_provider_timeout'
        : 'ai_provider_unavailable',
      operation,
    })
    recordAiProviderError(error)
    throw error
  }

  try {
    if (!response.ok) {
      let error = await readAiProviderErrorResponse(response, {
        ...diagnosticContext,
        operation,
      })
      if (callerAbortTriggered) throw new AiProviderCallerCancelledError()
      if (timeoutTriggered) {
        error = createAiProviderError({
          ...diagnosticContext,
          code: 'ai_provider_timeout',
          operation,
          status: response.status,
        })
      }
      recordAiProviderError(error)
      throw error
    }

    let data: {
      choices: Array<{
        message: {
          content: string | null
          reasoning?: string
          reasoning_details?: unknown
        }
      }>
      usage?: {
        completion_tokens?: number
        cost?: number
        prompt_tokens?: number
        completion_tokens_details?: {
          reasoning_tokens?: number
        }
      }
    }
    try {
      data = await readAiProviderJson<typeof data>(response, {
        ...diagnosticContext,
        operation,
      })
    } catch (error) {
      if (callerAbortTriggered) throw new AiProviderCallerCancelledError()
      const providerError = isAiProviderError(error)
        ? timeoutTriggered
          ? createAiProviderError({
              ...diagnosticContext,
              code: 'ai_provider_timeout',
              operation,
              status: response.status,
            })
          : error
        : createAiProviderError({
            ...diagnosticContext,
            code: 'ai_provider_invalid_response',
            operation,
            status: response.status,
          })
      recordAiProviderError(providerError)
      throw providerError
    }

    if (!isRecord(data) || !Array.isArray(data.choices)) {
      throwInvalidProviderResponse(
        operation,
        diagnosticContext,
        response.status,
      )
    }
    const choice = data.choices[0]
    if (!isRecord(choice) || !isRecord(choice.message)) {
      throwInvalidProviderResponse(
        operation,
        diagnosticContext,
        response.status,
      )
    }
    const message = choice.message
    if (typeof message.content !== 'string' || !message.content) {
      throwInvalidProviderResponse(
        operation,
        diagnosticContext,
        response.status,
      )
    }

    if (data.usage !== undefined) {
      if (
        !isRecord(data.usage) ||
        !hasOptionalFiniteNumber(data.usage, 'completion_tokens') ||
        !hasOptionalFiniteNumber(data.usage, 'cost') ||
        !hasOptionalFiniteNumber(data.usage, 'prompt_tokens')
      ) {
        throwInvalidProviderResponse(
          operation,
          diagnosticContext,
          response.status,
        )
      }
      const details = data.usage.completion_tokens_details
      if (
        details !== undefined &&
        (!isRecord(details) ||
          !hasOptionalFiniteNumber(details, 'reasoning_tokens'))
      ) {
        throwInvalidProviderResponse(
          operation,
          diagnosticContext,
          response.status,
        )
      }
    }

    let content: T
    try {
      content = JSON.parse(message.content) as T
    } catch {
      const error = createAiProviderError({
        ...diagnosticContext,
        code: 'ai_provider_invalid_response',
        operation,
        status: response.status,
      })
      recordAiProviderError(error)
      throw error
    }

    const usage = data.usage
    return {
      content,
      stats: {
        completionTokens: usage?.completion_tokens ?? 0,
        cost: usage?.cost ?? 0,
        promptTokens: usage?.prompt_tokens ?? 0,
        reasoningTokens:
          usage?.completion_tokens_details?.reasoning_tokens ?? 0,
        totalTokens:
          (usage?.prompt_tokens ?? 0) + (usage?.completion_tokens ?? 0),
      },
      thinking: readReasoningText(message),
    }
  } finally {
    clearTimeout(timeoutId)
    options.signal?.removeEventListener('abort', onCallerAbort)
  }
}

// ---------------------------------------------------------------------------
// Streaming chat (for API route SSE)
// ---------------------------------------------------------------------------

export async function* generateChatStream(
  options: GenerateOptions,
): AsyncGenerator<StreamEvent> {
  const operation = 'chat.completions' as const
  const diagnosticContext = {
    correlationId: options.correlationId,
    modelProvider: options.model?.split('/', 1)[0],
    requestId: options.requestId,
  }
  let apiKey: string
  try {
    apiKey = getApiKey(operation, options)
  } catch (error) {
    if (isAiProviderError(error)) yield aiProviderStreamError(error)
    return
  }
  const model = options.model || getDefaultModel()

  const effort = options.reasoningEffort || 'high'
  const body: Record<string, unknown> = {
    include_reasoning: effort !== 'none',
    messages: options.messages,
    model,
    reasoning: effort === 'none' ? { enabled: false } : { effort },
    stream: true,
  }

  if (options.format) {
    applyKnownResponseFormat(body, options.format, options.supportedParameters)
  }

  if (options.providerPreferences) {
    body.provider = options.providerPreferences
  }

  // Use an idle timeout for streaming: long active generations are allowed,
  // but a provider that stops sending data is still cancelled.
  const STREAM_IDLE_TIMEOUT_MS = 120_000
  const childController = new AbortController()
  let idleTimeoutId: ReturnType<typeof setTimeout> | undefined
  let idleTimeoutTriggered = false
  let callerAbortTriggered = false

  const clearIdleTimeout = (): void => {
    if (idleTimeoutId) {
      clearTimeout(idleTimeoutId)
      idleTimeoutId = undefined
    }
  }

  const startIdleTimeout = (): void => {
    clearIdleTimeout()
    idleTimeoutTriggered = false
    idleTimeoutId = setTimeout(() => {
      idleTimeoutTriggered = true
      childController.abort()
    }, STREAM_IDLE_TIMEOUT_MS)
  }

  const onCallerAbort = (): void => {
    callerAbortTriggered = true
    childController.abort()
  }
  if (options.signal) {
    if (options.signal.aborted) {
      onCallerAbort()
    } else {
      options.signal.addEventListener('abort', onCallerAbort, { once: true })
    }
  }

  let response: Response
  try {
    startIdleTimeout()
    response = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
      body: JSON.stringify(body),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      method: 'POST',
      signal: childController.signal,
    })
  } catch {
    clearIdleTimeout()
    options.signal?.removeEventListener('abort', onCallerAbort)
    if (callerAbortTriggered) return
    const error = createAiProviderError({
      ...diagnosticContext,
      code: idleTimeoutTriggered
        ? 'ai_provider_timeout'
        : 'ai_provider_unavailable',
      operation,
    })
    recordAiProviderError(error)
    yield aiProviderStreamError(error)
    return
  } finally {
    clearIdleTimeout()
  }

  if (callerAbortTriggered) {
    options.signal?.removeEventListener('abort', onCallerAbort)
    return
  }

  if (!response.ok) {
    let error: AiProviderError
    try {
      startIdleTimeout()
      error = await readAiProviderErrorResponse(response, {
        ...diagnosticContext,
        operation,
      })
    } finally {
      clearIdleTimeout()
      options.signal?.removeEventListener('abort', onCallerAbort)
    }
    if (callerAbortTriggered) return
    if (idleTimeoutTriggered) {
      error = createAiProviderError({
        ...diagnosticContext,
        code: 'ai_provider_timeout',
        operation,
        status: response.status,
      })
    }
    recordAiProviderError(error)
    yield aiProviderStreamError(error)
    return
  }

  const streamFailure = (
    code: AiProviderErrorCode,
    metadata?: AiProviderErrorMetadata,
  ): StreamEvent => {
    const error = createAiProviderError({
      ...diagnosticContext,
      code,
      metadata,
      operation,
      status: response.status,
    })
    recordAiProviderError(error)
    return aiProviderStreamError(error)
  }

  if (
    getAiProviderContentTypeCategory(response.headers.get('content-type')) !==
    'event-stream'
  ) {
    options.signal?.removeEventListener('abort', onCallerAbort)
    yield streamFailure('ai_provider_invalid_response', {
      contentTypeCategory: getAiProviderContentTypeCategory(
        response.headers.get('content-type'),
      ),
      upstreamRequestId: getSafeUpstreamRequestId(response.headers),
    })
    return
  }

  if (!response.body) {
    clearIdleTimeout()
    options.signal?.removeEventListener('abort', onCallerAbort)
    yield streamFailure('ai_provider_invalid_response')
    return
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder('utf-8', { fatal: true })
  const encoder = new TextEncoder()
  let buffer = ''
  let currentFrameBytes = 0
  let accumulatedOutputBytes = 0
  let thinkingSoFar = ''
  let contentSoFar = ''
  let lastStats: GenerationStats = {
    completionTokens: 0,
    cost: 0,
    promptTokens: 0,
    reasoningTokens: 0,
    totalTokens: 0,
  }

  try {
    for (;;) {
      let readResult: ReadableStreamReadResult<Uint8Array>
      try {
        startIdleTimeout()
        readResult = await reader.read()
      } catch {
        if (callerAbortTriggered) return
        yield streamFailure(
          idleTimeoutTriggered
            ? 'ai_provider_timeout'
            : 'ai_provider_response_read_failed',
        )
        return
      } finally {
        clearIdleTimeout()
      }

      if (callerAbortTriggered) return

      const { done, value } = readResult
      if (done) break

      try {
        buffer += decoder.decode(value, { stream: true })
      } catch {
        yield streamFailure('ai_provider_invalid_response', {
          contentTypeCategory: 'event-stream',
        })
        return
      }
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      const residualBufferBytes = encoder.encode(buffer).byteLength
      if (residualBufferBytes > AI_PROVIDER_RESPONSE_LIMITS.sseFrameBytes) {
        await reader.cancel().catch(() => undefined)
        yield streamFailure('ai_provider_response_too_large', {
          contentTypeCategory: 'event-stream',
          observedBytes: residualBufferBytes,
          truncated: true,
        })
        return
      }

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) {
          currentFrameBytes = 0
          continue
        }
        currentFrameBytes += encoder.encode(line).byteLength + 1
        if (currentFrameBytes > AI_PROVIDER_RESPONSE_LIMITS.sseFrameBytes) {
          await reader.cancel().catch(() => undefined)
          yield streamFailure('ai_provider_response_too_large', {
            contentTypeCategory: 'event-stream',
            observedBytes: currentFrameBytes,
            truncated: true,
          })
          return
        }
        if (trimmed.startsWith(':')) continue
        if (trimmed === 'data: [DONE]') {
          yield {
            phase: 'done',
            rawContent: contentSoFar,
            stats: lastStats,
            thinking: thinkingSoFar,
          }
          return
        }
        if (!trimmed.startsWith('data: ')) continue

        const jsonStr = trimmed.slice(6)
        let chunk: {
          choices?: Array<{
            delta?: {
              content?: string | null
              reasoning?: string | null
              reasoning_details?: unknown
            }
            finish_reason?: string | null
          }>
          usage?: {
            completion_tokens?: number
            cost?: number
            prompt_tokens?: number
            completion_tokens_details?: {
              reasoning_tokens?: number
            }
          }
        }

        try {
          chunk = JSON.parse(jsonStr) as typeof chunk
        } catch {
          yield streamFailure('ai_provider_invalid_response', {
            contentTypeCategory: 'event-stream',
          })
          return
        }

        if (
          !isRecord(chunk) ||
          (chunk.choices !== undefined && !Array.isArray(chunk.choices)) ||
          (chunk.usage !== undefined && !isRecord(chunk.usage))
        ) {
          yield streamFailure('ai_provider_invalid_response', {
            contentTypeCategory: 'event-stream',
          })
          return
        }

        const firstChoice = chunk.choices?.[0]
        if (
          (firstChoice !== undefined && !isRecord(firstChoice)) ||
          (firstChoice?.delta !== undefined && !isRecord(firstChoice.delta)) ||
          (firstChoice?.delta?.content !== undefined &&
            firstChoice.delta.content !== null &&
            typeof firstChoice.delta.content !== 'string') ||
          (chunk.usage !== undefined &&
            (!hasOptionalFiniteNumber(chunk.usage, 'completion_tokens') ||
              !hasOptionalFiniteNumber(chunk.usage, 'cost') ||
              !hasOptionalFiniteNumber(chunk.usage, 'prompt_tokens') ||
              (chunk.usage.completion_tokens_details !== undefined &&
                (!isRecord(chunk.usage.completion_tokens_details) ||
                  !hasOptionalFiniteNumber(
                    chunk.usage.completion_tokens_details,
                    'reasoning_tokens',
                  )))))
        ) {
          yield streamFailure('ai_provider_invalid_response', {
            contentTypeCategory: 'event-stream',
          })
          return
        }

        const delta = firstChoice?.delta

        // Reasoning/thinking content
        const reasoningChunk = delta ? readReasoningText(delta) : ''
        if (reasoningChunk) {
          accumulatedOutputBytes += encoder.encode(reasoningChunk).byteLength
          if (
            accumulatedOutputBytes >
            AI_PROVIDER_RESPONSE_LIMITS.sseAccumulatedBytes
          ) {
            await reader.cancel().catch(() => undefined)
            yield streamFailure('ai_provider_response_too_large', {
              contentTypeCategory: 'event-stream',
              observedBytes: accumulatedOutputBytes,
              truncated: true,
            })
            return
          }
          thinkingSoFar += reasoningChunk
          yield {
            chunk: reasoningChunk,
            phase: 'thinking',
            thinkingSoFar,
          }
        }

        // Generated content
        if (delta?.content) {
          accumulatedOutputBytes += encoder.encode(delta.content).byteLength
          if (
            accumulatedOutputBytes >
            AI_PROVIDER_RESPONSE_LIMITS.sseAccumulatedBytes
          ) {
            await reader.cancel().catch(() => undefined)
            yield streamFailure('ai_provider_response_too_large', {
              contentTypeCategory: 'event-stream',
              observedBytes: accumulatedOutputBytes,
              truncated: true,
            })
            return
          }
          contentSoFar += delta.content
          yield { chunk: delta.content, phase: 'generating' }
        }

        // Usage stats (typically in the final chunk)
        if (chunk.usage) {
          lastStats = {
            completionTokens: chunk.usage.completion_tokens ?? 0,
            cost: chunk.usage.cost ?? 0,
            promptTokens: chunk.usage.prompt_tokens ?? 0,
            reasoningTokens:
              chunk.usage.completion_tokens_details?.reasoning_tokens ?? 0,
            totalTokens:
              (chunk.usage.prompt_tokens ?? 0) +
              (chunk.usage.completion_tokens ?? 0),
          }
        }
      }
    }

    yield streamFailure('ai_provider_invalid_response', {
      contentTypeCategory: 'event-stream',
    })
  } finally {
    clearIdleTimeout()
    options.signal?.removeEventListener('abort', onCallerAbort)
    reader.releaseLock()
  }
}

// ---------------------------------------------------------------------------
// Model listing
// ---------------------------------------------------------------------------

interface ProviderCatalogModel {
  architecture?: { modality?: string }
  context_length?: number
  id: string
  name: string
  pricing?: {
    completion?: string
    prompt?: string
    reasoning?: string
  }
  supported_parameters?: string[]
}

function isValidCatalogModel(model: unknown): model is ProviderCatalogModel {
  if (!isRecord(model)) return false
  if (typeof model.id !== 'string' || typeof model.name !== 'string')
    return false
  if (!hasOptionalFiniteNumber(model, 'context_length')) return false

  if (model.architecture !== undefined) {
    if (!isRecord(model.architecture)) return false
    if (
      model.architecture.modality !== undefined &&
      typeof model.architecture.modality !== 'string'
    ) {
      return false
    }
  }

  if (model.pricing !== undefined) {
    if (!isRecord(model.pricing)) return false
    if (
      (model.pricing.completion !== undefined &&
        typeof model.pricing.completion !== 'string') ||
      (model.pricing.prompt !== undefined &&
        typeof model.pricing.prompt !== 'string') ||
      (model.pricing.reasoning !== undefined &&
        typeof model.pricing.reasoning !== 'string')
    ) {
      return false
    }
  }

  return (
    model.supported_parameters === undefined ||
    (Array.isArray(model.supported_parameters) &&
      model.supported_parameters.every(
        parameter => typeof parameter === 'string',
      ))
  )
}

async function fetchProviderJson<T>(
  url: string,
  apiKey: string,
  operation: Exclude<AiProviderOperation, 'chat.completions'>,
  context: OpenRouterRequestContext,
  timeoutMs: number,
): Promise<T> {
  const signal = AbortSignal.timeout(timeoutMs)
  let response: Response
  try {
    response = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal,
    })
  } catch {
    const error = createAiProviderError({
      ...context,
      code: signal.aborted ? 'ai_provider_timeout' : 'ai_provider_unavailable',
      operation,
    })
    recordAiProviderError(error)
    throw error
  }

  if (!response.ok) {
    let error = await readAiProviderErrorResponse(response, {
      ...context,
      operation,
    })
    if (signal.aborted) {
      error = createAiProviderError({
        ...context,
        code: 'ai_provider_timeout',
        operation,
        status: response.status,
      })
    }
    recordAiProviderError(error)
    throw error
  }

  try {
    return await readAiProviderJson<T>(response, { ...context, operation })
  } catch (error) {
    const providerError = isAiProviderError(error)
      ? signal.aborted
        ? createAiProviderError({
            ...context,
            code: 'ai_provider_timeout',
            operation,
            status: response.status,
          })
        : error
      : createAiProviderError({
          ...context,
          code: 'ai_provider_invalid_response',
          operation,
          status: response.status,
        })
    recordAiProviderError(providerError)
    throw providerError
  }
}

export async function listModels(
  supportedParameters?: string[],
  context: OpenRouterRequestContext = {},
): Promise<OpenRouterModel[]> {
  const apiKey = getApiKey('models.list', context)

  const url = new URL(`${OPENROUTER_BASE}/models`)
  // Always require reasoning + stream + response_format (at minimum json_object)
  const params = ['reasoning', 'stream', 'response_format']
  if (supportedParameters) {
    for (const p of supportedParameters) {
      if (!params.includes(p)) params.push(p)
    }
  }
  url.searchParams.set('supported_parameters', params.join(','))

  const data = await fetchProviderJson<{ data: ProviderCatalogModel[] }>(
    url.toString(),
    apiKey,
    'models.list',
    context,
    10_000,
  )

  if (!data || !Array.isArray(data.data)) {
    throwInvalidProviderResponse('models.list', context)
  }
  if (!data.data.every(isValidCatalogModel)) {
    throwInvalidProviderResponse('models.list', context)
  }

  return (data.data ?? []).map(m => ({
    contextLength: m.context_length ?? 0,
    id: m.id,
    modality: m.architecture?.modality,
    name: m.name,
    pricing: {
      completion: m.pricing?.completion ?? '0',
      prompt: m.pricing?.prompt ?? '0',
      reasoning: m.pricing?.reasoning ?? m.pricing?.completion ?? '0',
    },
    provider: m.id.split('/')[0],
    supportedParameters: m.supported_parameters ?? [],
  }))
}

// ---------------------------------------------------------------------------
// Credit balance
// ---------------------------------------------------------------------------

export interface KeyInfo {
  isFreeTier: boolean
  limit: number | null
  limitRemaining: number | null
  managementKeyMissing: boolean
  totalCredits: number | null
  usage: number
  usageDaily: number
}

export async function getKeyInfo(
  context: OpenRouterRequestContext = {},
): Promise<KeyInfo> {
  const apiKey = getApiKey('key.info', context)
  const mgmtKey = process.env.OPENROUTER_MGMT_API_KEY

  const creditsPromise = mgmtKey
    ? fetchProviderJson<{
        data: { total_credits?: number; total_usage?: number }
      }>(`${OPENROUTER_BASE}/credits`, mgmtKey, 'credits', context, 5_000)
        .then(data => {
          if (
            !isRecord(data) ||
            !isRecord(data.data) ||
            !hasOptionalFiniteNumber(data.data, 'total_credits') ||
            !hasOptionalFiniteNumber(data.data, 'total_usage')
          ) {
            throwInvalidProviderResponse('credits', context)
          }
          return data
        })
        .catch(() => null)
    : Promise.resolve(null)

  const [keyData, creditsData] = await Promise.all([
    fetchProviderJson<{
      data: {
        is_free_tier?: boolean
        limit?: number | null
        limit_remaining?: number | null
        usage?: number
        usage_daily?: number
      }
    }>(`${OPENROUTER_BASE}/auth/key`, apiKey, 'key.info', context, 5_000),
    creditsPromise,
  ])

  if (
    !isRecord(keyData) ||
    !isRecord(keyData.data) ||
    (keyData.data.is_free_tier !== undefined &&
      typeof keyData.data.is_free_tier !== 'boolean') ||
    !hasOptionalFiniteNumberOrNull(keyData.data, 'limit') ||
    !hasOptionalFiniteNumberOrNull(keyData.data, 'limit_remaining') ||
    !hasOptionalFiniteNumber(keyData.data, 'usage') ||
    !hasOptionalFiniteNumber(keyData.data, 'usage_daily')
  ) {
    throwInvalidProviderResponse('key.info', context)
  }

  let totalCredits: number | null = null
  if (creditsData) {
    const purchased = creditsData.data?.total_credits
    const used = creditsData.data?.total_usage
    if (purchased != null) {
      totalCredits = purchased - (used ?? 0)
    }
  }

  const d = keyData.data
  return {
    isFreeTier: d.is_free_tier ?? false,
    limit: d.limit ?? null,
    limitRemaining: d.limit_remaining ?? null,
    managementKeyMissing: !mgmtKey,
    totalCredits,
    usage: d.usage ?? 0,
    usageDaily: d.usage_daily ?? 0,
  }
}
