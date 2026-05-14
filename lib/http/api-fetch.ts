/**
 * Drop-in replacement for `fetch()` used by client components for
 * **same-origin** API calls. For state-changing methods (POST/PUT/PATCH/
 * DELETE) it always sets or normalizes `X-Requested-With: XMLHttpRequest`,
 * which the server-side CSRF check (`assertSameOriginRequest`) requires. Safe
 * (GET/HEAD/OPTIONS) requests are forwarded unchanged so existing call sites
 * and tests that pass a bare init object continue to behave identically.
 */
import { dispatchAuthReauthRequired } from '@/lib/auth/client-events'

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

function reportUnauthorizedResponse(
  input: RequestInfo | URL,
  response: Response,
): Response {
  if (response.status === 401 && isSameOriginApiRequest(input)) {
    dispatchAuthReauthRequired('api_unauthorized')
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
  if (!xRequestedWith || xRequestedWith.toLowerCase() !== 'xmlhttprequest') {
    headers.set('X-Requested-With', 'XMLHttpRequest')
  }

  return reportUnauthorizedResponse(
    input,
    await fetch(input, { ...(init ?? {}), headers }),
  )
}
