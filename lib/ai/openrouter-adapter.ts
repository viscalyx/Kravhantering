import type {
  AIConnectionAdapter,
  AiConnectionAdapterRegistration,
  AiConnectionAdapterRunRequest,
  AiRunEvent,
  AiRunFailure,
  AiRunIdentity,
  AiRunUsage,
  AiUsageMetric,
} from './run-contracts'
import { AI_OPTIONAL_CAPABILITIES } from './run-contracts'

export const OPENROUTER_ADAPTER_TYPE = 'openrouter'
export const OPENROUTER_ADAPTER_VERSION = '1'

const DEFAULT_ENDPOINT = 'https://openrouter.ai/api/v1'
const MAX_JSON_RESPONSE_BYTES = 4 * 1024 * 1024
const MAX_STREAM_FRAME_BYTES = 256 * 1024
const MAX_STREAM_OUTPUT_BYTES = 4 * 1024 * 1024

export interface OpenRouterAdapterConfiguration {
  /** Plaintext secret supplied only in transient configuration at invocation. */
  apiKey: string
  endpoint?: string
  providerPreferences?: {
    dataCollection?: 'allow' | 'deny'
    zeroDataRetention?: boolean
  }
}

export interface OpenRouterAdapterModelConfiguration {
  reasoningEffort?: 'high' | 'low' | 'medium' | 'none'
}

interface OpenRouterUsage {
  completion_tokens?: unknown
  completion_tokens_details?: { reasoning_tokens?: unknown }
  cost?: unknown
  prompt_tokens?: unknown
  total_tokens?: unknown
}

interface OpenRouterMessage {
  content?: unknown
  reasoning?: unknown
  reasoning_details?: unknown
}

interface OpenRouterStreamChunk {
  choices?: unknown
  error?: unknown
  usage?: unknown
}

interface OpenRouterAbortContext {
  callerAborted: () => boolean
  cleanup: () => void
  controller: AbortController
  deadlineExceeded: () => boolean
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isJsonContentType(value: string | null): boolean {
  const mediaType = value?.split(';', 1)[0]?.trim().toLowerCase()
  return (
    mediaType === 'application/json' || Boolean(mediaType?.endsWith('+json'))
  )
}

async function readBoundedJson(response: Response): Promise<unknown> {
  if (!response.body) throw new Error('missing response body')
  const reader = response.body.getReader()
  const decoder = new TextDecoder('utf-8', { fatal: true })
  let bytes = 0
  let text = ''
  let complete = false
  try {
    for (;;) {
      const result = await reader.read()
      if (result.done) {
        complete = true
        break
      }
      bytes += result.value.byteLength
      if (bytes > MAX_JSON_RESPONSE_BYTES) {
        throw new Error('response body exceeds limit')
      }
      text += decoder.decode(result.value, { stream: true })
    }
    text += decoder.decode()
    return JSON.parse(text) as unknown
  } finally {
    if (!complete) await reader.cancel().catch(() => undefined)
  }
}

function readConfiguration(
  value: unknown,
): OpenRouterAdapterConfiguration | null {
  if (
    !isRecord(value) ||
    typeof value.apiKey !== 'string' ||
    value.apiKey.length === 0 ||
    value.apiKey.length > 4096 ||
    value.apiKey.trim() !== value.apiKey
  ) {
    return null
  }
  if (value.endpoint !== undefined && typeof value.endpoint !== 'string') {
    return null
  }
  if (typeof value.endpoint === 'string') {
    try {
      const endpoint = new URL(value.endpoint)
      if (
        endpoint.protocol !== 'https:' ||
        endpoint.username ||
        endpoint.password ||
        endpoint.search ||
        endpoint.hash
      ) {
        return null
      }
    } catch {
      return null
    }
  }
  const preferences = value.providerPreferences
  if (preferences !== undefined) {
    if (!isRecord(preferences)) return null
    if (
      preferences.dataCollection !== undefined &&
      preferences.dataCollection !== 'allow' &&
      preferences.dataCollection !== 'deny'
    ) {
      return null
    }
    if (
      preferences.zeroDataRetention !== undefined &&
      typeof preferences.zeroDataRetention !== 'boolean'
    ) {
      return null
    }
  }
  return value as unknown as OpenRouterAdapterConfiguration
}

function readModelConfiguration(
  value: unknown,
): OpenRouterAdapterModelConfiguration | null {
  if (!isRecord(value)) return null
  const effort = value.reasoningEffort
  if (
    effort !== undefined &&
    effort !== 'high' &&
    effort !== 'medium' &&
    effort !== 'low' &&
    effort !== 'none'
  ) {
    return null
  }
  return value as unknown as OpenRouterAdapterModelConfiguration
}

function isExternalModelId(value: string): boolean {
  return (
    value.length > 0 &&
    value.length <= 450 &&
    [...value].every(character => {
      const codePoint = character.codePointAt(0) ?? 0
      return codePoint >= 32 && codePoint !== 127
    })
  )
}

function identity(request: AiConnectionAdapterRunRequest): AiRunIdentity {
  return {
    aiConnectionId: request.connection.id,
    aiConnectionModelRevisionId: request.modelRevision.id,
    aiRunProfileRevisionId: request.runProfileRevisionId,
  }
}

function unavailable<T>(
  reason: 'not_reported' | 'not_supported',
): AiUsageMetric<T> {
  return { reason, status: 'unavailable' }
}

function reportedToken(value: unknown): AiUsageMetric<number> {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? { status: 'reported', value }
    : unavailable('not_reported')
}

function tokenCount(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? value
    : null
}

function readUsage(
  value: unknown,
  request: AiConnectionAdapterRunRequest,
): AiRunUsage {
  const usage = isRecord(value) ? (value as OpenRouterUsage) : undefined
  const details = isRecord(usage?.completion_tokens_details)
    ? usage.completion_tokens_details
    : undefined
  const tokenUsage = request.selectedCapabilities.tokenUsage
  const cost = request.selectedCapabilities.cost
  const inputTokens = tokenCount(usage?.prompt_tokens)
  const outputTokens = tokenCount(usage?.completion_tokens)
  const reportedTotalTokens = tokenCount(usage?.total_tokens)
  const totalTokens: AiUsageMetric<number> = !tokenUsage
    ? unavailable('not_supported')
    : reportedTotalTokens !== null
      ? { status: 'reported', value: reportedTotalTokens }
      : inputTokens !== null && outputTokens !== null
        ? {
            calculatedAt: new Date().toISOString(),
            status: 'calculated',
            value: inputTokens + outputTokens,
          }
        : unavailable('not_reported')
  return {
    analysisTokens:
      tokenUsage && request.selectedCapabilities.aiAnalysis
        ? reportedToken(details?.reasoning_tokens)
        : unavailable('not_supported'),
    cost:
      cost &&
      typeof usage?.cost === 'number' &&
      Number.isFinite(usage.cost) &&
      usage.cost >= 0
        ? {
            status: 'reported',
            value: { amount: String(usage.cost), currency: 'USD' },
          }
        : unavailable(cost ? 'not_reported' : 'not_supported'),
    inputTokens: tokenUsage
      ? reportedToken(inputTokens)
      : unavailable('not_supported'),
    outputTokens: tokenUsage
      ? reportedToken(outputTokens)
      : unavailable('not_supported'),
    totalTokens,
  }
}

function readAnalysis(message: OpenRouterMessage): string | null {
  if (typeof message.reasoning === 'string') return message.reasoning
  if (!Array.isArray(message.reasoning_details)) return null
  const parts = message.reasoning_details.flatMap(detail => {
    if (!isRecord(detail)) return []
    if (typeof detail.text === 'string') return [detail.text]
    return typeof detail.summary === 'string' ? [detail.summary] : []
  })
  return parts.length > 0 ? parts.join('') : null
}

function failureEvent(
  request: AiConnectionAdapterRunRequest,
  failure: AiRunFailure,
): AiRunEvent {
  return { failure, identity: identity(request), type: 'failed' }
}

function cancelledEvent(request: AiConnectionAdapterRunRequest): AiRunEvent {
  return {
    identity: identity(request),
    reason: 'application_cancelled',
    type: 'cancelled',
  }
}

function createAbortContext(
  request: AiConnectionAdapterRunRequest,
): OpenRouterAbortContext | null {
  const deadline = Date.parse(request.context.deadlineAt)
  if (!Number.isFinite(deadline)) return null
  const controller = new AbortController()
  let callerAborted = request.context.abortSignal.aborted
  let deadlineExceeded = deadline <= Date.now()
  const onCallerAbort = (): void => {
    callerAborted = true
    controller.abort()
  }
  if (!callerAborted) {
    request.context.abortSignal.addEventListener('abort', onCallerAbort, {
      once: true,
    })
  }
  const timeout = deadlineExceeded
    ? undefined
    : setTimeout(
        () => {
          deadlineExceeded = true
          controller.abort()
        },
        Math.min(deadline - Date.now(), 2_147_483_647),
      )
  if (callerAborted || deadlineExceeded) controller.abort()
  return {
    callerAborted: () => callerAborted,
    cleanup: () => {
      if (timeout) clearTimeout(timeout)
      request.context.abortSignal.removeEventListener('abort', onCallerAbort)
    },
    controller,
    deadlineExceeded: () => deadlineExceeded,
  }
}

function abortEvent(
  request: AiConnectionAdapterRunRequest,
  context: OpenRouterAbortContext,
): AiRunEvent | null {
  if (context.callerAborted()) return cancelledEvent(request)
  if (context.deadlineExceeded()) {
    return failureEvent(request, {
      category: 'deadline_exceeded',
      diagnosticCode: 'upstream_deadline_exceeded',
      retryable: true,
    })
  }
  return null
}

function retryAfterSeconds(response: Response): number | undefined {
  const value = response.headers.get('retry-after')
  if (!value || !/^\d+$/u.test(value)) return undefined
  const seconds = Number(value)
  return Number.isSafeInteger(seconds) && seconds > 0 ? seconds : undefined
}

function providerStatusFailure(
  request: AiConnectionAdapterRunRequest,
  status: number,
  retryAfter?: number,
): AiRunEvent {
  if (status === 401 || status === 403) {
    return failureEvent(request, {
      category: 'authentication_failed',
      diagnosticCode: 'upstream_authentication_failed',
      retryable: false,
    })
  }
  if (status === 429) {
    return failureEvent(request, {
      category: 'rate_limited',
      diagnosticCode: 'upstream_rate_limited',
      retryAfterSeconds: retryAfter,
      retryable: true,
    })
  }
  if (status === 408 || status === 504) {
    return failureEvent(request, {
      category: 'deadline_exceeded',
      diagnosticCode: 'upstream_deadline_exceeded',
      retryable: true,
    })
  }
  if (status >= 400 && status < 500) {
    return failureEvent(request, {
      category: 'request_rejected',
      diagnosticCode: 'upstream_request_rejected',
      retryable: false,
    })
  }
  return failureEvent(request, {
    category: 'connection_unavailable',
    diagnosticCode: 'upstream_unavailable',
    retryable: true,
  })
}

function inBandProviderFailure(
  request: AiConnectionAdapterRunRequest,
  value: unknown,
): AiRunEvent {
  if (
    !isRecord(value) ||
    typeof value.code !== 'number' ||
    !Number.isSafeInteger(value.code) ||
    value.code < 400 ||
    value.code > 599
  ) {
    return failureEvent(request, {
      category: 'invalid_response',
      diagnosticCode: 'invalid_upstream_error',
      retryable: false,
    })
  }
  return providerStatusFailure(request, value.code)
}

function upstreamFailure(
  request: AiConnectionAdapterRunRequest,
  response: Response,
): AiRunEvent {
  return providerStatusFailure(
    request,
    response.status,
    retryAfterSeconds(response),
  )
}

function requestBody(
  request: AiConnectionAdapterRunRequest,
  configuration: OpenRouterAdapterConfiguration,
  modelConfiguration: OpenRouterAdapterModelConfiguration,
): Record<string, unknown> {
  const content = request.task.content.map(part =>
    part.type === 'text'
      ? { text: part.text, type: 'text' }
      : {
          image_url: {
            url: `data:${part.mediaType};base64,${Buffer.from(part.data).toString('base64')}`,
          },
          type: 'image_url',
        },
  )
  const effort = request.selectedCapabilities.aiAnalysis
    ? (modelConfiguration.reasoningEffort ?? 'high')
    : 'none'
  const body: Record<string, unknown> = {
    include_reasoning: request.selectedCapabilities.aiAnalysis,
    messages: [
      { content: request.task.instructions, role: 'system' },
      { content, role: 'user' },
    ],
    model: request.modelRevision.externalModelId,
    reasoning: effort === 'none' ? { enabled: false } : { effort },
    response_format: request.selectedCapabilities.jsonSchemaSteering
      ? {
          json_schema: {
            name: 'requirement_import',
            schema: request.task.responseSchema,
            strict: true,
          },
          type: 'json_schema',
        }
      : { type: 'json_object' },
    stream: request.selectedCapabilities.streaming,
    user: request.context.externalRunId,
    provider: {
      allow_fallbacks: false,
      ...(configuration.providerPreferences?.dataCollection
        ? {
            data_collection: configuration.providerPreferences.dataCollection,
          }
        : {}),
      ...(configuration.providerPreferences?.zeroDataRetention !== undefined
        ? { zdr: configuration.providerPreferences.zeroDataRetention }
        : {}),
    },
  }
  return body
}

async function runNonStreaming(
  request: AiConnectionAdapterRunRequest,
  configuration: OpenRouterAdapterConfiguration,
  modelConfiguration: OpenRouterAdapterModelConfiguration,
  abortContext: OpenRouterAbortContext,
): Promise<AiRunEvent> {
  let response: Response
  try {
    response = await fetch(
      `${(configuration.endpoint ?? DEFAULT_ENDPOINT).replace(/\/$/u, '')}/chat/completions`,
      {
        body: JSON.stringify(
          requestBody(request, configuration, modelConfiguration),
        ),
        headers: {
          Authorization: `Bearer ${configuration.apiKey}`,
          'Content-Type': 'application/json',
        },
        method: 'POST',
        redirect: 'error',
        signal: abortContext.controller.signal,
      },
    )
  } catch {
    const aborted = abortEvent(request, abortContext)
    if (aborted) return aborted
    return failureEvent(request, {
      category: 'connection_unavailable',
      diagnosticCode: 'upstream_request_failed',
      retryable: true,
    })
  }
  if (!response.ok) return upstreamFailure(request, response)
  if (!isJsonContentType(response.headers.get('content-type'))) {
    return failureEvent(request, {
      category: 'invalid_response',
      diagnosticCode: 'unexpected_upstream_content_type',
      retryable: false,
    })
  }
  let data: unknown
  try {
    data = await readBoundedJson(response)
  } catch {
    const aborted = abortEvent(request, abortContext)
    if (aborted) return aborted
    return failureEvent(request, {
      category: 'invalid_response',
      diagnosticCode: 'invalid_upstream_response',
      retryable: false,
    })
  }
  if (!isRecord(data)) {
    return failureEvent(request, {
      category: 'invalid_response',
      diagnosticCode: 'invalid_upstream_response',
      retryable: false,
    })
  }
  if (data.error !== undefined)
    return inBandProviderFailure(request, data.error)
  if (!Array.isArray(data.choices)) {
    return failureEvent(request, {
      category: 'invalid_response',
      diagnosticCode: 'invalid_upstream_response',
      retryable: false,
    })
  }
  const choice = data.choices[0]
  if (
    isRecord(choice) &&
    (choice.error !== undefined || choice.finish_reason === 'error')
  ) {
    return inBandProviderFailure(request, choice.error)
  }
  const message =
    isRecord(choice) && isRecord(choice.message)
      ? (choice.message as OpenRouterMessage)
      : undefined
  if (!message || typeof message.content !== 'string') {
    return failureEvent(request, {
      category: 'invalid_response',
      diagnosticCode: 'invalid_upstream_response',
      retryable: false,
    })
  }
  return {
    analysis: request.selectedCapabilities.aiAnalysis
      ? readAnalysis(message)
      : null,
    identity: identity(request),
    rawOutput: message.content,
    type: 'completed',
    usage: readUsage(data.usage, request),
  }
}

function readStreamDelta(value: unknown): {
  analysis: string | null
  output: string | null
} | null {
  if (!isRecord(value)) return null
  const choices = value.choices
  if (choices !== undefined && !Array.isArray(choices)) return null
  const choice = Array.isArray(choices) ? choices[0] : undefined
  if (choice === undefined) return { analysis: null, output: null }
  if (!isRecord(choice) || !isRecord(choice.delta)) return null
  const delta = choice.delta
  if (
    delta.content !== undefined &&
    delta.content !== null &&
    typeof delta.content !== 'string'
  ) {
    return null
  }
  const analysis = readAnalysis(delta as OpenRouterMessage)
  return {
    analysis,
    output: typeof delta.content === 'string' ? delta.content : null,
  }
}

async function* runStreaming(
  request: AiConnectionAdapterRunRequest,
  configuration: OpenRouterAdapterConfiguration,
  modelConfiguration: OpenRouterAdapterModelConfiguration,
  abortContext: OpenRouterAbortContext,
): AsyncIterable<AiRunEvent> {
  let response: Response
  try {
    response = await fetch(
      `${(configuration.endpoint ?? DEFAULT_ENDPOINT).replace(/\/$/u, '')}/chat/completions`,
      {
        body: JSON.stringify(
          requestBody(request, configuration, modelConfiguration),
        ),
        headers: {
          Authorization: `Bearer ${configuration.apiKey}`,
          'Content-Type': 'application/json',
        },
        method: 'POST',
        redirect: 'error',
        signal: abortContext.controller.signal,
      },
    )
  } catch {
    const aborted = abortEvent(request, abortContext)
    yield aborted ??
      failureEvent(request, {
        category: 'connection_unavailable',
        diagnosticCode: 'upstream_request_failed',
        retryable: true,
      })
    return
  }
  if (!response.ok) {
    yield upstreamFailure(request, response)
    return
  }
  if (
    !response.headers
      .get('content-type')
      ?.toLowerCase()
      .includes('text/event-stream') ||
    !response.body
  ) {
    yield failureEvent(request, {
      category: 'invalid_response',
      diagnosticCode: 'unexpected_upstream_content_type',
      retryable: false,
    })
    return
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder('utf-8', { fatal: true })
  const encoder = new TextEncoder()
  let buffer = ''
  let analysis = ''
  let output = ''
  let accumulatedOutputBytes = 0
  let usage: unknown
  let completed = false
  try {
    while (!completed) {
      let result: ReadableStreamReadResult<Uint8Array>
      try {
        result = await reader.read()
      } catch {
        const aborted = abortEvent(request, abortContext)
        yield aborted ??
          failureEvent(request, {
            category: 'connection_unavailable',
            diagnosticCode: 'upstream_stream_read_failed',
            retryable: true,
          })
        return
      }
      if (result.done) break
      try {
        buffer += decoder.decode(result.value, { stream: true })
      } catch {
        yield failureEvent(request, {
          category: 'invalid_response',
          diagnosticCode: 'invalid_upstream_stream_encoding',
          retryable: false,
        })
        return
      }
      const frames = buffer.split(/\r?\n\r?\n/u)
      buffer = frames.pop() ?? ''
      if (encoder.encode(buffer).byteLength > MAX_STREAM_FRAME_BYTES) {
        yield failureEvent(request, {
          category: 'invalid_response',
          diagnosticCode: 'upstream_stream_frame_too_large',
          retryable: false,
        })
        return
      }
      for (const frame of frames) {
        if (encoder.encode(frame).byteLength > MAX_STREAM_FRAME_BYTES) {
          yield failureEvent(request, {
            category: 'invalid_response',
            diagnosticCode: 'upstream_stream_frame_too_large',
            retryable: false,
          })
          return
        }
        const payload = frame
          .split(/\r?\n/u)
          .filter(line => line.startsWith('data:'))
          .map(line => line.slice(5).trimStart())
          .join('\n')
        if (!payload) continue
        if (payload === '[DONE]') {
          completed = true
          break
        }
        let chunk: OpenRouterStreamChunk
        try {
          chunk = JSON.parse(payload) as OpenRouterStreamChunk
        } catch {
          yield failureEvent(request, {
            category: 'invalid_response',
            diagnosticCode: 'invalid_upstream_stream_event',
            retryable: false,
          })
          return
        }
        if (isRecord(chunk) && chunk.error !== undefined) {
          yield inBandProviderFailure(request, chunk.error)
          return
        }
        const delta = readStreamDelta(chunk)
        if (!delta) {
          yield failureEvent(request, {
            category: 'invalid_response',
            diagnosticCode: 'invalid_upstream_stream_event',
            retryable: false,
          })
          return
        }
        if (chunk.usage !== undefined) usage = chunk.usage
        if (request.selectedCapabilities.aiAnalysis && delta.analysis) {
          accumulatedOutputBytes += encoder.encode(delta.analysis).byteLength
          analysis += delta.analysis
          if (accumulatedOutputBytes > MAX_STREAM_OUTPUT_BYTES) {
            yield failureEvent(request, {
              category: 'invalid_response',
              diagnosticCode: 'upstream_stream_output_too_large',
              retryable: false,
            })
            return
          }
          yield { delta: delta.analysis, type: 'analysis_delta' }
        }
        if (delta.output) {
          accumulatedOutputBytes += encoder.encode(delta.output).byteLength
          output += delta.output
          if (accumulatedOutputBytes > MAX_STREAM_OUTPUT_BYTES) {
            yield failureEvent(request, {
              category: 'invalid_response',
              diagnosticCode: 'upstream_stream_output_too_large',
              retryable: false,
            })
            return
          }
          yield {
            delta: delta.output,
            type: 'output_delta',
            visibility: 'internal',
          }
        }
      }
    }
  } finally {
    if (!completed) await reader.cancel().catch(() => undefined)
  }
  if (!completed) {
    const aborted = abortEvent(request, abortContext)
    yield aborted ??
      failureEvent(request, {
        category: 'invalid_response',
        diagnosticCode: 'incomplete_upstream_stream',
        retryable: false,
      })
    return
  }
  yield {
    analysis: request.selectedCapabilities.aiAnalysis ? analysis || null : null,
    identity: identity(request),
    rawOutput: output,
    type: 'completed',
    usage: readUsage(usage, request),
  }
}

const openRouterAdapter: AIConnectionAdapter = {
  async *run(
    request: AiConnectionAdapterRunRequest,
  ): AsyncIterable<AiRunEvent> {
    const configuration = readConfiguration(request.connection.configuration)
    const modelConfiguration = readModelConfiguration(
      request.modelRevision.configuration,
    )
    if (
      !configuration ||
      !modelConfiguration ||
      !isExternalModelId(request.modelRevision.externalModelId)
    ) {
      yield failureEvent(request, {
        category: 'adapter_failure',
        diagnosticCode: 'invalid_adapter_configuration',
        retryable: false,
      })
      return
    }
    if (
      !request.selectedCapabilities.imageInput &&
      request.task.content.some(part => part.type === 'image')
    ) {
      yield failureEvent(request, {
        category: 'capability_mismatch',
        diagnosticCode: 'capability_mismatch:imageInput',
        retryable: false,
      })
      return
    }
    const missingCapability = AI_OPTIONAL_CAPABILITIES.find(
      capability =>
        request.selectedCapabilities[capability] &&
        !request.modelRevision.verifiedCapabilities[capability],
    )
    if (missingCapability) {
      yield failureEvent(request, {
        category: 'capability_mismatch',
        diagnosticCode: `capability_mismatch:${missingCapability}`,
        retryable: false,
      })
      return
    }
    const abortContext = createAbortContext(request)
    if (!abortContext) {
      yield failureEvent(request, {
        category: 'adapter_failure',
        diagnosticCode: 'invalid_adapter_deadline',
        retryable: false,
      })
      return
    }
    const initialAbort = abortEvent(request, abortContext)
    if (initialAbort) {
      abortContext.cleanup()
      yield initialAbort
      return
    }
    try {
      if (request.selectedCapabilities.streaming) {
        yield* runStreaming(
          request,
          configuration,
          modelConfiguration,
          abortContext,
        )
      } else {
        yield await runNonStreaming(
          request,
          configuration,
          modelConfiguration,
          abortContext,
        )
      }
    } finally {
      abortContext.cleanup()
      abortContext.controller.abort()
    }
  },
}

export const openRouterAdapterRegistration = Object.freeze({
  adapter: openRouterAdapter,
  adapterType: OPENROUTER_ADAPTER_TYPE,
  adapterVersion: OPENROUTER_ADAPTER_VERSION,
}) satisfies AiConnectionAdapterRegistration
