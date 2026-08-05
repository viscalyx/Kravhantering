import { describe, expect, it, vi } from 'vitest'
import { readResponseMessage } from '@/lib/http/response-message'

describe('readResponseMessage', () => {
  it('reads trimmed API error and message fields from JSON responses', async () => {
    await expect(
      readResponseMessage(
        Response.json({ error: '  Request failed  ', message: 'ignored' }),
      ),
    ).resolves.toBe('Request failed')
    await expect(
      readResponseMessage(Response.json({ message: '  Try again  ' })),
    ).resolves.toBe('Try again')
  })

  it('reads JSON strings and ignores empty or unsupported JSON bodies', async () => {
    await expect(
      readResponseMessage(Response.json('  failed  ')),
    ).resolves.toBe('failed')
    await expect(readResponseMessage(Response.json('   '))).resolves.toBeNull()
    await expect(
      readResponseMessage(Response.json({ error: 400, message: null })),
    ).resolves.toBeNull()
  })

  it('extracts structured messages from text responses before using raw text', async () => {
    await expect(
      readResponseMessage(
        new Response('{"message":"  Text response failed  "}', {
          headers: { 'Content-Type': 'text/plain' },
        }),
      ),
    ).resolves.toBe('Text response failed')
    await expect(
      readResponseMessage(
        new Response('  Gateway unavailable  ', {
          headers: { 'Content-Type': 'text/plain' },
        }),
      ),
    ).resolves.toBe('Gateway unavailable')
  })

  it('returns null for empty or malformed JSON response bodies', async () => {
    await expect(
      readResponseMessage(
        new Response('{', {
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    ).resolves.toBeNull()
    await expect(readResponseMessage(new Response('   '))).resolves.toBeNull()
  })

  it('falls back to a JSON reader when a response has no text reader', async () => {
    const response = {
      headers: new Headers(),
      json: vi.fn().mockResolvedValue({ error: 'Fallback error' }),
    } as unknown as Response

    await expect(readResponseMessage(response)).resolves.toBe('Fallback error')
  })

  it('returns null when response readers reject or are unavailable', async () => {
    const rejectingResponse = {
      headers: new Headers(),
      json: vi.fn().mockRejectedValue(new Error('body unavailable')),
      text: vi.fn().mockRejectedValue(new Error('body unavailable')),
    } as unknown as Response
    const unavailableResponse = {
      headers: new Headers(),
    } as unknown as Response

    await expect(readResponseMessage(rejectingResponse)).resolves.toBeNull()
    await expect(readResponseMessage(unavailableResponse)).resolves.toBeNull()
  })
})
