import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  aiProviderErrorPayload,
  classifyAiProviderStatus,
  createAiProviderError,
  getAiProviderContentTypeCategory,
  recordAiProviderError,
} from '@/lib/ai/provider-errors'

beforeEach(() => vi.clearAllMocks())

describe('AI provider errors', () => {
  it.each([
    [400, 'ai_provider_configuration_error'],
    [408, 'ai_provider_timeout'],
    [429, 'ai_provider_rate_limited'],
    [500, 'ai_provider_unavailable'],
    [504, 'ai_provider_timeout'],
  ] as const)('classifies status %i as %s', (status, code) => {
    expect(classifyAiProviderStatus(status)).toBe(code)
  })

  it('keeps public and diagnostic data bounded to validated fields', () => {
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)
    const error = createAiProviderError({
      code: 'ai_provider_unavailable',
      correlationId: 'unsafe email@example.test',
      metadata: {
        providerCode: 'safe_code',
        upstreamRequestId: 'unsafe identifier with spaces',
      },
      modelProvider: 'anthropic',
      operation: 'models.list',
      requestId: 'request-479',
      status: 503,
    })

    try {
      recordAiProviderError(error)

      expect(aiProviderErrorPayload(error)).toEqual({
        code: 'ai_provider_unavailable',
        error: 'AI provider is unavailable',
      })
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        JSON.stringify({
          channel: 'ai-provider-observability',
          event: 'ai_provider.request_failed',
          code: 'ai_provider_unavailable',
          gateway: 'openrouter',
          operation: 'models.list',
          model_provider: 'anthropic',
          upstream_status: 503,
          request_id: 'request-479',
          provider_code: 'safe_code',
        }),
      )
      recordAiProviderError(error)
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1)
    } finally {
      consoleErrorSpy.mockRestore()
    }
  })

  it.each([
    ['application/problem+json; charset=utf-8', 'json'],
    ['text/event-stream', 'event-stream'],
    ['text/plain', 'unexpected'],
    [null, 'missing'],
  ] as const)('classifies %s as %s', (contentType, category) => {
    expect(getAiProviderContentTypeCategory(contentType)).toBe(category)
  })
})
