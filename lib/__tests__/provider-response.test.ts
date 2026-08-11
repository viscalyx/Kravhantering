import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AI_PROVIDER_RESPONSE_LIMITS } from '@/lib/ai/provider-errors'
import {
  readAiProviderErrorResponse,
  readAiProviderJson,
} from '@/lib/ai/provider-response'

const options = { operation: 'chat.completions' as const }

beforeEach(() => vi.clearAllMocks())

describe('AI provider response readers', () => {
  it('does not read an error body with an unexpected media type', async () => {
    const stream = new ReadableStream<Uint8Array>()
    const cancelSpy = vi.spyOn(stream, 'cancel')
    const getReaderSpy = vi.spyOn(stream, 'getReader')
    const response = new Response(stream, {
      headers: { 'Content-Type': 'text/plain' },
      status: 500,
    })

    const error = await readAiProviderErrorResponse(response, options)

    expect(error.code).toBe('ai_provider_unavailable')
    expect(cancelSpy).toHaveBeenCalledOnce()
    expect(getReaderSpy).not.toHaveBeenCalled()
  })

  it('cancels an unexpected success body before rejecting it', async () => {
    const stream = new ReadableStream<Uint8Array>()
    const cancelSpy = vi.spyOn(stream, 'cancel')
    const response = new Response(stream, {
      headers: { 'Content-Type': 'text/plain' },
    })

    await expect(readAiProviderJson(response, options)).rejects.toMatchObject({
      code: 'ai_provider_invalid_response',
    })
    expect(cancelSpy).toHaveBeenCalledOnce()
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

  it('stops reading oversized JSON at the shared success-body limit', async () => {
    const response = new Response(
      'x'.repeat(AI_PROVIDER_RESPONSE_LIMITS.jsonBodyBytes + 1),
      { headers: { 'Content-Type': 'application/json' } },
    )

    await expect(readAiProviderJson(response, options)).rejects.toMatchObject({
      code: 'ai_provider_response_too_large',
      metadata: { truncated: true },
    })
  })

  it('does not retain malformed JSON body text in the error', async () => {
    const providerBody = '{"secret":"recognizable-provider-body"'
    const response = new Response(providerBody, {
      headers: { 'Content-Type': 'application/json' },
    })

    const rejection = readAiProviderJson(response, options)
    await expect(rejection).rejects.toMatchObject({
      code: 'ai_provider_invalid_response',
      message: 'AI provider returned an invalid response',
    })
    await rejection.catch(error => {
      expect(JSON.stringify(error)).not.toContain('recognizable-provider-body')
      expect(JSON.stringify(error.metadata)).not.toContain(
        'recognizable-provider-body',
      )
    })
  })
})
