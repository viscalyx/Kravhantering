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

export interface GenerationStats {
  completionTokens: number
  cost: number
  promptTokens: number
  reasoningTokens: number
  totalTokens: number
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
  | { message: string; phase: 'error' }

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
  format?: Record<string, unknown>
  messages: ChatMessage[]
  model?: string
  /** OpenRouter provider-level data-policy preferences */
  providerPreferences?: ProviderPreferences
  /** Reasoning effort level (default: 'high'). Use 'none' to disable reasoning. */
  reasoningEffort?: string
  signal?: AbortSignal
  /** Model's supported_parameters from OpenRouter, used to decide response_format strategy */
  supportedParameters?: string[]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getApiKey(): string {
  const key = process.env.OPENROUTER_API_KEY
  if (!key) {
    throw new Error('OPENROUTER_API_KEY environment variable is not set')
  }
  return key
}

function getDefaultModel(): string {
  return process.env.NEXT_PUBLIC_DEFAULT_MODEL || 'anthropic/claude-sonnet-4'
}

const OPENROUTER_BASE = 'https://openrouter.ai/api/v1'

/**
 * Apply the best response_format strategy based on the model's capabilities.
 * - When capabilities are unknown (undefined): use json_schema (backward-compatible)
 * - structured_outputs → json_schema (strict schema enforcement)
 * - otherwise → json_object (basic JSON mode, all listed models support response_format)
 */
function applyResponseFormat(
  body: Record<string, unknown>,
  schema: Record<string, unknown>,
  supportedParameters?: string[],
): void {
  // When capabilities are unknown, default to json_schema (MCP/non-UI callers)
  if (
    !supportedParameters ||
    supportedParameters.includes('structured_outputs')
  ) {
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

// ---------------------------------------------------------------------------
// Non-streaming chat (for MCP server)
// ---------------------------------------------------------------------------

export async function generateChat<T>(
  options: GenerateOptions,
): Promise<NonStreamingResult<T>> {
  const apiKey = getApiKey()
  const model = options.model || getDefaultModel()

  const effort = options.reasoningEffort || 'high'
  const body: Record<string, unknown> = {
    messages: options.messages,
    model,
    reasoning: effort === 'none' ? { enabled: false } : { effort },
    stream: false,
  }

  if (options.format) {
    applyResponseFormat(body, options.format, options.supportedParameters)
  }

  if (options.providerPreferences) {
    body.provider = options.providerPreferences
  }

  // Always enforce a 120 s timeout. When the caller also provides a signal,
  // wire it so that either the timeout or the caller's abort cancels the fetch.
  const DEFAULT_TIMEOUT_MS = 120_000
  const childController = new AbortController()
  const timeoutId = setTimeout(
    () => childController.abort(),
    DEFAULT_TIMEOUT_MS,
  )

  const onCallerAbort = () => childController.abort()
  if (options.signal) {
    if (options.signal.aborted) {
      childController.abort()
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
  } catch (err) {
    clearTimeout(timeoutId)
    options.signal?.removeEventListener('abort', onCallerAbort)
    throw err
  }

  try {
    if (!response.ok) {
      const text = await response.text().catch(() => '')
      throw new Error(`OpenRouter request failed (${response.status}): ${text}`)
    }

    const data = (await response.json()) as {
      choices: Array<{
        message: {
          content: string | null
          reasoning?: string
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

    const message = data.choices?.[0]?.message
    if (!message?.content) {
      throw new Error('OpenRouter returned empty response')
    }

    let content: T
    try {
      content = JSON.parse(message.content) as T
    } catch {
      throw new Error('Failed to parse OpenRouter JSON response')
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
      thinking: message.reasoning ?? '',
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
  const apiKey = getApiKey()
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
    applyResponseFormat(body, options.format, options.supportedParameters)
  }

  if (options.providerPreferences) {
    body.provider = options.providerPreferences
  }

  // Timeout + caller-signal support, mirroring generateChat hardening.
  const STREAM_TIMEOUT_MS = 120_000
  const childController = new AbortController()
  const streamTimeoutId = setTimeout(
    () => childController.abort(),
    STREAM_TIMEOUT_MS,
  )

  const onCallerAbort = () => childController.abort()
  if (options.signal) {
    if (options.signal.aborted) {
      childController.abort()
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
  } catch (err) {
    clearTimeout(streamTimeoutId)
    options.signal?.removeEventListener('abort', onCallerAbort)
    const message = err instanceof Error ? err.message : 'Fetch failed'
    yield { message: `OpenRouter fetch error: ${message}`, phase: 'error' }
    return
  }

  if (!response.ok) {
    clearTimeout(streamTimeoutId)
    options.signal?.removeEventListener('abort', onCallerAbort)
    const text = await response.text().catch(() => '')
    yield {
      message: `OpenRouter error (${response.status}): ${text}`,
      phase: 'error',
    }
    return
  }

  if (!response.body) {
    clearTimeout(streamTimeoutId)
    options.signal?.removeEventListener('abort', onCallerAbort)
    yield { message: 'No response body from OpenRouter', phase: 'error' }
    return
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
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
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith(':')) continue
        if (trimmed === 'data: [DONE]') continue
        if (!trimmed.startsWith('data: ')) continue

        const jsonStr = trimmed.slice(6)
        let chunk: {
          choices?: Array<{
            delta?: {
              content?: string | null
              reasoning?: string | null
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
          continue
        }

        const delta = chunk.choices?.[0]?.delta

        // Reasoning/thinking content
        if (delta?.reasoning) {
          thinkingSoFar += delta.reasoning
          yield {
            chunk: delta.reasoning,
            phase: 'thinking',
            thinkingSoFar,
          }
        }

        // Generated content
        if (delta?.content) {
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

    yield {
      phase: 'done',
      rawContent: contentSoFar,
      stats: lastStats,
      thinking: thinkingSoFar,
    }
  } finally {
    clearTimeout(streamTimeoutId)
    options.signal?.removeEventListener('abort', onCallerAbort)
    reader.releaseLock()
  }
}

// ---------------------------------------------------------------------------
// Model listing
// ---------------------------------------------------------------------------

export async function listModels(
  supportedParameters?: string[],
): Promise<OpenRouterModel[]> {
  const apiKey = getApiKey()

  const url = new URL(`${OPENROUTER_BASE}/models`)
  // Always require reasoning + stream + response_format (at minimum json_object)
  const params = ['reasoning', 'stream', 'response_format']
  if (supportedParameters) {
    for (const p of supportedParameters) {
      if (!params.includes(p)) params.push(p)
    }
  }
  url.searchParams.set('supported_parameters', params.join(','))

  const response = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(10_000),
  })

  if (!response.ok) {
    throw new Error(`Failed to list OpenRouter models (${response.status})`)
  }

  const data = (await response.json()) as {
    data: Array<{
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
    }>
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

export async function getKeyInfo(): Promise<KeyInfo> {
  const apiKey = getApiKey()
  const mgmtKey = process.env.OPENROUTER_MGMT_API_KEY

  const creditsPromise = mgmtKey
    ? fetch(`${OPENROUTER_BASE}/credits`, {
        headers: { Authorization: `Bearer ${mgmtKey}` },
        signal: AbortSignal.timeout(5_000),
      }).catch(() => null)
    : Promise.resolve(null)

  const [keyResponse, creditsResponse] = await Promise.all([
    fetch(`${OPENROUTER_BASE}/auth/key`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(5_000),
    }),
    creditsPromise,
  ])

  if (!keyResponse.ok) {
    throw new Error(`Failed to get OpenRouter key info (${keyResponse.status})`)
  }

  const keyData = (await keyResponse.json()) as {
    data?: {
      is_free_tier?: boolean
      limit?: number | null
      limit_remaining?: number | null
      usage?: number
      usage_daily?: number
    }
  }

  let totalCredits: number | null = null
  if (creditsResponse?.ok) {
    const creditsData = (await creditsResponse.json()) as {
      data?: { total_credits?: number; total_usage?: number }
    }
    const purchased = creditsData.data?.total_credits
    const used = creditsData.data?.total_usage
    if (purchased != null) {
      totalCredits = purchased - (used ?? 0)
    }
  }

  const d = keyData.data ?? {}
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
