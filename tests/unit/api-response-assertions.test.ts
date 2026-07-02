import { describe, expect, it, vi } from 'vitest'
import {
  type ApiResponseLike,
  apiResponseFailureMessage,
  expectApiResponseOk,
  expectApiResponseStatus,
} from '@/tests/integration/api-response-assertions'

function response(options: {
  ok?: boolean
  status?: number
  statusText?: string
  text?: string
}): ApiResponseLike {
  return {
    ok: vi.fn(() => options.ok ?? true),
    status: vi.fn(() => options.status ?? 200),
    statusText: options.statusText
      ? vi.fn(() => options.statusText ?? '')
      : undefined,
    text: vi.fn(async () => options.text ?? ''),
  }
}

describe('API response assertions', () => {
  it('returns the original response when an OK assertion succeeds', async () => {
    const okResponse = response({ ok: true })

    await expect(
      expectApiResponseOk(okResponse, 'load settings'),
    ).resolves.toBe(okResponse)
  })

  it('includes label, status, status text, and full body when OK assertion fails', async () => {
    const body = `first line\n${'diagnostic '.repeat(500)}last line`
    const failingResponse = response({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
      text: body,
    })

    await expect(
      expectApiResponseOk(failingResponse, 'load settings'),
    ).rejects.toThrow(`load settings returned 503 Service Unavailable: ${body}`)
  })

  it('includes expected and actual status when status assertion fails', async () => {
    const failingResponse = response({
      status: 403,
      statusText: 'Forbidden',
      text: 'No assignment grants access.',
    })

    await expect(
      expectApiResponseStatus(failingResponse, 201, 'create requirement'),
    ).rejects.toThrow(
      'create requirement returned 403 Forbidden: No assignment grants access. instead of 201',
    )
  })

  it('formats responses without status text', async () => {
    await expect(
      apiResponseFailureMessage(
        response({ status: 500, text: 'database unavailable' }),
      ),
    ).resolves.toBe('500: database unavailable')
  })
})
