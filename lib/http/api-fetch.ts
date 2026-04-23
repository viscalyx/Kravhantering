/**
 * Drop-in replacement for `fetch()` used by client components for
 * **same-origin** API calls. For state-changing methods (POST/PUT/PATCH/
 * DELETE) it always sets `X-Requested-With: XMLHttpRequest`, which the
 * server-side CSRF check (`assertSameOriginRequest`) requires. Safe (GET/
 * HEAD/OPTIONS) requests are forwarded unchanged so existing call sites and
 * tests that pass a bare init object continue to behave identically.
 */
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

export function apiFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const method = (init?.method ?? 'GET').toUpperCase()
  if (SAFE_METHODS.has(method)) {
    return fetch(input, init as RequestInit)
  }
  const headers = new Headers(init?.headers)
  if (!headers.has('x-requested-with')) {
    headers.set('X-Requested-With', 'XMLHttpRequest')
  }
  return fetch(input, { ...(init ?? {}), headers })
}
