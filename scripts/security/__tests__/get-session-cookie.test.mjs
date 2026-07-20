import { describe, expect, it, vi } from 'vitest'

import {
  DEFAULT_FETCH_TIMEOUT_MS,
  decodeHtmlEntities,
  fetchWithTimeout,
  isSafeSessionCookieOutput,
  parseFetchTimeoutMs,
} from '../get-session-cookie.mjs'

describe('parseFetchTimeoutMs', () => {
  it.each([
    ['missing', undefined],
    ['blank', ''],
    ['whitespace', '   '],
  ])('uses the default timeout for %s values', (_label, value) => {
    expect(parseFetchTimeoutMs(value)).toBe(DEFAULT_FETCH_TIMEOUT_MS)
  })

  it('accepts a positive integer override', () => {
    expect(parseFetchTimeoutMs('5000')).toBe(5000)
  })

  it.each(['0', '-1', '1.5', 'abc', '15000ms'])(
    'rejects invalid override %s',
    value => {
      expect(() => parseFetchTimeoutMs(value)).toThrow(
        'DAST_FETCH_TIMEOUT_MS must be a positive integer number of milliseconds',
      )
    },
  )

  it('rejects values that are too large to use safely', () => {
    expect(() => parseFetchTimeoutMs('4294967296')).toThrow(
      'DAST_FETCH_TIMEOUT_MS must be no greater than 2147483647 milliseconds',
    )
  })
})

describe('fetchWithTimeout', () => {
  it('times out stalled fetches with the sanitized URL and timeout', async () => {
    const fetchImpl = vi.fn(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () => {
            const error = new Error('aborted')
            error.name = 'AbortError'
            reject(error)
          })
        }),
    )

    let caught
    try {
      await fetchWithTimeout(
        'https://idp.example/login?session_code=secret#fragment',
        { method: 'POST' },
        { fetchImpl, timeoutMs: 5 },
      )
    } catch (err) {
      caught = err
    }

    expect(caught).toBeInstanceOf(Error)
    expect(caught.message).toBe(
      'POST https://idp.example/login timed out after 5 ms',
    )
    expect(caught.message).not.toContain('session_code')
    expect(caught.message).not.toContain('fragment')
    const init = fetchImpl.mock.calls[0]?.[1]
    expect(init?.method).toBe('POST')
    expect(init?.signal).toBeInstanceOf(AbortSignal)
  })

  it('treats Node timeout errors as fetch timeouts', async () => {
    const fetchImpl = vi.fn(async () => {
      const error = new Error('operation timed out')
      error.name = 'TimeoutError'
      throw error
    })

    await expect(
      fetchWithTimeout(
        'https://app.example/api/auth/me?token=secret',
        {},
        {
          fetchImpl,
          timeoutMs: 9,
        },
      ),
    ).rejects.toThrow(
      'GET https://app.example/api/auth/me timed out after 9 ms',
    )
  })

  it('does not rewrite non-timeout fetch errors', async () => {
    const upstreamError = new Error('connection refused')
    const fetchImpl = vi.fn(async () => {
      throw upstreamError
    })

    await expect(
      fetchWithTimeout('https://app.example/api/auth/me', {}, { fetchImpl }),
    ).rejects.toBe(upstreamError)
  })
})

describe('isSafeSessionCookieOutput', () => {
  it.each([
    ['standard cookie', 'kravhantering_session=sealedValue123'],
    [
      'iron-session seal characters',
      'kravhantering_session=Fe26.2*1*8f8e70039b8c696c*fEsCKlLIL3q631INzC6-ag*1778955072071*8HYJm0ME1yfixZ_HKrO7LzSQDpgVAOd0PBvR1OaCBqI~2',
    ],
    ['base64-style value characters', 'kravhantering_session=abc+/def=='],
  ])('accepts %s', (_label, value) => {
    expect(isSafeSessionCookieOutput(value)).toBe(true)
  })

  it.each([
    ['whitespace in value', 'kravhantering_session=abc def'],
    ['quoted value', 'kravhantering_session="abc"'],
    ['semicolon attribute', 'kravhantering_session=abc; Path=/'],
    ['trailing newline', 'kravhantering_session=abc\n'],
    ['empty name', '=abc'],
    ['empty value', 'kravhantering_session='],
  ])('rejects %s', (_label, value) => {
    expect(isSafeSessionCookieOutput(value)).toBe(false)
  })
})

describe('decodeHtmlEntities', () => {
  it('decodes each supported entity', () => {
    expect(decodeHtmlEntities('&quot;')).toBe('"')
    expect(decodeHtmlEntities('&#x2F;')).toBe('/')
    expect(decodeHtmlEntities('&#39;')).toBe("'")
    expect(decodeHtmlEntities('&lt;')).toBe('<')
    expect(decodeHtmlEntities('&gt;')).toBe('>')
    expect(decodeHtmlEntities('&amp;')).toBe('&')
  })

  it('decodes a typical Keycloak form action with multiple entities', () => {
    const input =
      'https://kc.example/realms/r/login-actions/authenticate?session_code=abc&amp;execution=def&amp;client_id=app&amp;tab_id=xyz'
    expect(decodeHtmlEntities(input)).toBe(
      'https://kc.example/realms/r/login-actions/authenticate?session_code=abc&execution=def&client_id=app&tab_id=xyz',
    )
  })

  it('does not double-unescape: &amp;quot; becomes &quot;, not "', () => {
    expect(decodeHtmlEntities('&amp;quot;')).toBe('&quot;')
  })

  it('does not double-unescape combined entities: &amp;lt;div&amp;gt; becomes &lt;div&gt;', () => {
    expect(decodeHtmlEntities('&amp;lt;div&amp;gt;')).toBe('&lt;div&gt;')
  })

  it('handles a mix of all entities in one string', () => {
    expect(
      decodeHtmlEntities(
        'a&amp;b &quot;c&quot; &lt;d&gt; &#39;e&#39; path&#x2F;f',
      ),
    ).toBe('a&b "c" <d> \'e\' path/f')
  })

  it('returns an empty string unchanged', () => {
    expect(decodeHtmlEntities('')).toBe('')
  })

  it('leaves an already-decoded string unchanged', () => {
    expect(decodeHtmlEntities('plain text with no entities')).toBe(
      'plain text with no entities',
    )
  })

  it('leaves unknown entities intact', () => {
    expect(decodeHtmlEntities('&unknown; &nbsp; &copy;')).toBe(
      '&unknown; &nbsp; &copy;',
    )
  })

  it('leaves a bare ampersand without a known entity unchanged', () => {
    expect(decodeHtmlEntities('a & b')).toBe('a & b')
  })

  it('handles repeated occurrences of the same entity', () => {
    expect(decodeHtmlEntities('&amp;&amp;&amp;')).toBe('&&&')
    expect(decodeHtmlEntities('&lt;&lt;&gt;&gt;')).toBe('<<>>')
  })
})
