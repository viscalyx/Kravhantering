/**
 * Ollama API client with dual-mode support: streaming and non-streaming.
 * Uses Ollama's native /api/chat endpoint for think: true (thinking trace) support.
 */

// ---------------------------------------------------------------------------
// Ollama API types
// ---------------------------------------------------------------------------

interface OllamaChatRequest {
  format?: Record<string, unknown>
  messages: OllamaChatMessage[]
  model: string
  options?: { num_ctx?: number; temperature?: number }
  stream: boolean
  think?: boolean
}

interface OllamaChatMessage {
  content: string
  role: 'assistant' | 'system' | 'user'
}

interface OllamaChatResponse {
  done: boolean
  eval_count?: number
  eval_duration?: number
  message?: { content?: string; role?: string; thinking?: string }
  total_duration?: number
}

export interface OllamaModel {
  name: string
  parameter_size?: string
  quantization_level?: string
  size: number
}

interface OllamaTagsResponse {
  models: Array<{
    details?: { parameter_size?: string; quantization_level?: string }
    name: string
    size: number
  }>
}

// ---------------------------------------------------------------------------
// Client types
// ---------------------------------------------------------------------------

export interface GenerationStats {
  evalCount: number
  evalDuration: number
  totalDuration: number
}

export interface NonStreamingResult<T> {
  content: T
  stats: GenerationStats
  thinking: string
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getOllamaHost(): string {
  return process.env.OLLAMA_HOST || 'http://localhost:11434'
}

function getDefaultModel(): string {
  return process.env.OLLAMA_MODEL || 'qwen3:14b'
}

// ---------------------------------------------------------------------------
// Non-streaming (for MCP)
// ---------------------------------------------------------------------------

export async function generateChat<T>(options: {
  format?: Record<string, unknown>
  messages: OllamaChatMessage[]
  model?: string
  signal?: AbortSignal
  timeoutMs?: number
}): Promise<NonStreamingResult<T>> {
  const model = options.model ?? getDefaultModel()
  const host = getOllamaHost()

  const body: OllamaChatRequest = {
    format: options.format,
    messages: options.messages,
    model,
    options: { num_ctx: 32768 },
    stream: false,
    think: true,
  }

  const response = await fetch(`${host}/api/chat`, {
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
    signal: options.signal ?? AbortSignal.timeout(options.timeoutMs ?? 180_000),
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`Ollama request failed (${response.status}): ${text}`)
  }

  const data = (await response.json()) as OllamaChatResponse

  const rawContent = data.message?.content ?? ''
  let content: T
  try {
    content = JSON.parse(rawContent) as T
  } catch {
    throw new Error(
      `Failed to parse Ollama JSON response: ${rawContent.slice(0, 500)}`,
    )
  }

  return {
    content,
    stats: {
      evalCount: data.eval_count ?? 0,
      evalDuration: data.eval_duration ?? 0,
      totalDuration: data.total_duration ?? 0,
    },
    thinking: data.message?.thinking ?? '',
  }
}

// ---------------------------------------------------------------------------
// Streaming (for SSE endpoint)
// ---------------------------------------------------------------------------

export async function* generateChatStream(options: {
  format?: Record<string, unknown>
  messages: OllamaChatMessage[]
  model?: string
  signal?: AbortSignal
  timeoutMs?: number
}): AsyncGenerator<StreamEvent> {
  const model = options.model ?? getDefaultModel()
  const host = getOllamaHost()

  const body: OllamaChatRequest = {
    format: options.format,
    messages: options.messages,
    model,
    options: { num_ctx: 32768 },
    stream: true,
    think: true,
  }

  const response = await fetch(`${host}/api/chat`, {
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
    signal: options.signal ?? AbortSignal.timeout(options.timeoutMs ?? 300_000),
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    yield {
      message: `Ollama request failed (${response.status}): ${text}`,
      phase: 'error',
    }
    return
  }

  if (!response.body) {
    yield { message: 'No response body from Ollama', phase: 'error' }
    return
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let thinkingSoFar = ''
  let contentSoFar = ''
  let finalStats: GenerationStats = {
    evalCount: 0,
    evalDuration: 0,
    totalDuration: 0,
  }
  let buffer = ''
  let hadError = false

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      // Keep the last incomplete line in the buffer
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) continue

        let chunk: OllamaChatResponse
        try {
          chunk = JSON.parse(trimmed) as OllamaChatResponse
        } catch {
          continue
        }

        if (chunk.message?.thinking) {
          thinkingSoFar += chunk.message.thinking
          yield {
            chunk: chunk.message.thinking,
            phase: 'thinking',
            thinkingSoFar,
          }
        }

        if (chunk.message?.content) {
          contentSoFar += chunk.message.content
          yield { chunk: chunk.message.content, phase: 'generating' }
        }

        if (chunk.done) {
          finalStats = {
            evalCount: chunk.eval_count ?? 0,
            evalDuration: chunk.eval_duration ?? 0,
            totalDuration: chunk.total_duration ?? 0,
          }
        }
      }
    }

    // Process any leftover data in the buffer after the stream ends
    const remaining = buffer.trim()
    if (remaining) {
      try {
        const chunk = JSON.parse(remaining) as OllamaChatResponse

        if (chunk.message?.thinking) {
          thinkingSoFar += chunk.message.thinking
          yield {
            chunk: chunk.message.thinking,
            phase: 'thinking',
            thinkingSoFar,
          }
        }

        if (chunk.message?.content) {
          contentSoFar += chunk.message.content
          yield { chunk: chunk.message.content, phase: 'generating' }
        }

        if (chunk.done) {
          finalStats = {
            evalCount: chunk.eval_count ?? 0,
            evalDuration: chunk.eval_duration ?? 0,
            totalDuration: chunk.total_duration ?? 0,
          }
        }
      } catch {
        // Ignore malformed leftover
      }
    }
  } catch (err) {
    hadError = true
    if (err instanceof Error && err.name === 'AbortError') {
      yield { message: 'Request was aborted', phase: 'error' }
    } else {
      yield {
        message: err instanceof Error ? err.message : 'Stream error',
        phase: 'error',
      }
    }
  } finally {
    reader.releaseLock()
  }

  if (!hadError) {
    yield {
      phase: 'done',
      rawContent: contentSoFar,
      stats: finalStats,
      thinking: thinkingSoFar,
    }
  }
}

// ---------------------------------------------------------------------------
// Model listing
// ---------------------------------------------------------------------------

export async function listModels(): Promise<OllamaModel[]> {
  const host = getOllamaHost()

  const response = await fetch(`${host}/api/tags`, {
    signal: AbortSignal.timeout(5_000),
  })

  if (!response.ok) {
    throw new Error(`Failed to list Ollama models (${response.status})`)
  }

  const data = (await response.json()) as OllamaTagsResponse

  return data.models.map(m => ({
    name: m.name,
    parameter_size: m.details?.parameter_size,
    quantization_level: m.details?.quantization_level,
    size: m.size,
  }))
}
