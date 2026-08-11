import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  readAiProviderErrorResponse,
  readAiProviderJson,
} from '@/lib/ai/provider-response'

const options = { operation: 'chat.completions' as const }

beforeEach(() => vi.clearAllMocks())

describe('AI provider response readers', () => {
  it('does not read an error body with an unexpected media type', async () => {
    const stream = new ReadableStream<Uint8Array>()
    const getReaderSpy = vi.spyOn(stream, 'getReader')
    const response = new Response(stream, {
      headers: { 'Content-Type': 'text/plain' },
      status: 500,
    })

    const error = await readAiProviderErrorResponse(response, options)

    expect(error.code).toBe('ai_provider_unavailable')
    expect(getReaderSpy).not.toHaveBeenCalled()
  })

  it('reads recognized bounded JSON success data', async () => {
    const response = new Response(JSON.stringify({ data: 'safe' }), {
      headers: { 'Content-Type': 'application/json' },
    })

    await expect(readAiProviderJson(response, options)).resolves.toEqual({
      data: 'safe',
    })
  })

  it('fails with a stable code when a recognized body cannot be read', async () => {
    const response = new Response(
      new ReadableStream<Uint8Array>({
        pull(controller) {
          controller.error(new Error('secret provider exception'))
        },
      }),
      { headers: { 'Content-Type': 'application/json' }, status: 502 },
    )

    await expect(readAiProviderJson(response, options)).rejects.toMatchObject({
      code: 'ai_provider_response_read_failed',
      message: 'AI provider response could not be read',
    })
  })
})
