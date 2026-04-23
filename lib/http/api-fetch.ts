/**
 * Drop-in replacement for `fetch()` used by client components for
 * **same-origin** API calls. For state-changing methods (POST/PUT/PATCH/
 * DELETE) it always sets `X-Requested-With: XMLHttpRequest`, which the
 * server-side CSRF check (`assertSameOriginRequest`) requires. Safe (GET/
 * HEAD/OPTIONS) requests are forwarded unchanged so existing call sites and
 * tests that pass a bare init object continue to behave identically.
 */
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

function buildHeaders(input: RequestInfo | URL, init?: RequestInit): Headers {
  const headers = new Headers(
    input instanceof Request ? input.headers : undefined,
  )
  if (!(input instanceof Request)) {
    return new Headers(init?.headers)
  }

  new Headers(init?.headers).forEach((value, key) => {
    headers.set(key, value)
  })
  return headers
}

export function apiFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const method = (
    init?.method ?? (input instanceof Request ? input.method : 'GET')
  ).toUpperCase()
  const headers = buildHeaders(input, init)

  if (!SAFE_METHODS.has(method) && !headers.has('x-requested-with')) {
    headers.set('X-Requested-With', 'XMLHttpRequest')
  }

  if (input instanceof Request) {
    return fetch(new Request(input, { ...(init ?? {}), headers }))
  }

  return fetch(input, { ...(init ?? {}), headers })
}
