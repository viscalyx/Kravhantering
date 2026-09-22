/**
 * Drop-in replacement for `fetch()` used by client components for
 * **same-origin** API calls. For state-changing methods (POST/PUT/PATCH/
 * DELETE) it always sets or normalizes `X-Requested-With: XMLHttpRequest`,
 * which the server-side CSRF check (`assertSameOriginRequest`) requires. Safe
 * (GET/HEAD/OPTIONS) requests are forwarded unchanged so existing call sites
 * and tests that pass a bare init object continue to behave identically.
 */

import { dispatchAuthReauthRequired } from '@/lib/auth/client-events'
import { localizeServiceLimitResponse } from '@/lib/http/localize-service-limit-response'

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

function buildHeaders(input: RequestInfo | URL, init?: RequestInit): Headers {
  if (!(input instanceof Request)) {
    return new Headers(init?.headers)
  }

  const headers = new Headers(input.headers)
  new Headers(init?.headers).forEach((value, key) => {
    headers.set(key, value)
  })
  return headers
}

function requestUrl(input: RequestInfo | URL): string {
  if (input instanceof Request) return input.url
  return input.toString()
}

function isSameOriginApiRequest(input: RequestInfo | URL): boolean {
  if (typeof window === 'undefined') return false

  try {
    const url = new URL(requestUrl(input), window.location.href)
    return (
      url.origin === window.location.origin && url.pathname.startsWith('/api/')
    )
  } catch {
    return false
  }
}

async function reportUnauthorizedResponse(
  input: RequestInfo | URL,
  response: Response,
): Promise<Response> {
  if (response.status === 401 && isSameOriginApiRequest(input)) {
    dispatchAuthReauthRequired('api_unauthorized')
  }
  if (
    (response.status === 429 || response.status === 503) &&
    isSameOriginApiRequest(input)
  ) {
    const locale = window.location.pathname.startsWith('/sv') ? 'sv' : 'en'
    return localizeServiceLimitResponse(response, locale)
  }
  return response
}

export async function apiFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const method = (
    init?.method ?? (input instanceof Request ? input.method : 'GET')
  ).toUpperCase()

  // THROWAWAY #1356: no client API writes in the prototype build.
  if (
    process.env.NODE_ENV !== 'production' &&
    process.env.NEXT_PUBLIC_ISSUE_1356_PROTOTYPE === 'true' &&
    !SAFE_METHODS.has(method)
  ) {
    const locale =
      typeof window !== 'undefined' &&
      window.location.pathname.startsWith('/sv')
        ? 'sv'
        : 'en'
    const message =
      locale === 'sv'
        ? 'Prototyp: sparande är avstängt. Inga data har ändrats.'
        : 'Prototype: saving is disabled. No data has changed.'
    if (typeof window !== 'undefined')
      window.dispatchEvent(
        new CustomEvent('prototype-1356-blocked', {
          detail: { method, path: requestUrl(input) },
        }),
      )
    return Response.json({ error: message, message }, { status: 409 })
  }

  if (SAFE_METHODS.has(method)) {
    if (init === undefined) {
      return reportUnauthorizedResponse(input, await fetch(input))
    }

    if (input instanceof Request) {
      if (init.headers === undefined) {
        return reportUnauthorizedResponse(
          input,
          await fetch(new Request(input, init)),
        )
      }
      const headers = buildHeaders(input, init)
      return reportUnauthorizedResponse(
        input,
        await fetch(new Request(input, { ...init, headers })),
      )
    }

    return reportUnauthorizedResponse(input, await fetch(input, init))
  }

  const headers = buildHeaders(input, init)
  const xRequestedWith = headers.get('x-requested-with')
  if (xRequestedWith?.toLowerCase() !== 'xmlhttprequest') {
    headers.set('X-Requested-With', 'XMLHttpRequest')
  }

  return reportUnauthorizedResponse(
    input,
    await fetch(input, { ...(init ?? {}), headers }),
  )
}
