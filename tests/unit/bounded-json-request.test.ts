import { describe, expect, it, vi } from 'vitest'
import { readBoundedJsonRequest } from '@/lib/http/bounded-json-request'

function streamedRequest(
  chunks: string[],
  headers: Record<string, string> = {},
): { pull: ReturnType<typeof vi.fn>; request: Request } {
  const encoder = new TextEncoder()
  const pull = vi.fn(controller => {
    const chunk = chunks.shift()
    if (chunk === undefined) {
      controller.close()
      return
    }
    controller.enqueue(encoder.encode(chunk))
  })
  return {
    pull,
    request: new Request('https://example.test/api/import', {
      body: new ReadableStream({ pull }),
      duplex: 'half',
      headers: { 'Content-Type': 'application/json', ...headers },
      method: 'POST',
    } as RequestInit),
  }
}

describe('bounded JSON request reader', () => {
  it('trusts an over-limit Content-Length without consuming the body', async () => {
    const { request } = streamedRequest(['{"ok":true}'], {
      'Content-Length': '12',
    })

    const result = await readBoundedJsonRequest(request, { maxBytes: 11 })

    expect(result).toMatchObject({ code: 'request_bytes_exceeded', ok: false })
    expect(request.bodyUsed).toBe(false)
  })

  it('accepts the exact actual byte boundary with no Content-Length', async () => {
    const request = new Request('https://example.test/api/import', {
      body: '{"å":1}',
      method: 'POST',
    })
    const maxBytes = new TextEncoder().encode('{"å":1}').byteLength

    await expect(
      readBoundedJsonRequest(request, { maxBytes }),
    ).resolves.toMatchObject({
      data: { å: 1 },
      measuredBytes: maxBytes,
      ok: true,
    })
  })

  it('measures actual bytes when Content-Length is understated or invalid', async () => {
    for (const contentLength of ['1', 'invalid']) {
      const { request } = streamedRequest(['{"value":"too large"}'], {
        'Content-Length': contentLength,
      })

      await expect(
        readBoundedJsonRequest(request, { maxBytes: 10 }),
      ).resolves.toMatchObject({ code: 'request_bytes_exceeded', ok: false })
    }
  })

  it('ignores an unsafe integer Content-Length and measures the body', async () => {
    const { request } = streamedRequest(['{"ok":true}'], {
      'Content-Length': String(Number.MAX_SAFE_INTEGER + 1),
    })

    await expect(
      readBoundedJsonRequest(request, { maxBytes: 11 }),
    ).resolves.toMatchObject({ data: { ok: true }, ok: true })
  })

  it('returns a stable invalid JSON result after bounded reading', async () => {
    const request = new Request('https://example.test/api/import', {
      body: '{',
      method: 'POST',
    })

    await expect(
      readBoundedJsonRequest(request, { maxBytes: 10 }),
    ).resolves.toMatchObject({ code: 'invalid_json', ok: false })
  })
})
