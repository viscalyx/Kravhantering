#!/usr/bin/env node
/**
 * Drives a real Keycloak OIDC login against the locally running prodlike
 * server and prints the resulting iron-session cookie to stdout.
 *
 * Usage:
 *   node scripts/security/get-session-cookie.mjs <username>
 *
 * Required env vars (defaults match `.env.prodlike`):
 *   APP_BASE_URL                http://localhost:3001
 *   KEYCLOAK_PASSWORD           devpass
 *   AUTH_SESSION_COOKIE_NAME    kravhantering_session
 *
 * Optional env vars:
 *   DAST_FETCH_TIMEOUT_MS       15000
 *
 * Output (stdout, single line):
 *   <cookieName>=<sealedValue>
 *
 * The final output is validated before printing. Cookie names may contain
 * ASCII letters, digits, `_`, and `-`; sealed values may contain ASCII
 * letters, digits, `.`, `_`, `~`, `*`, `+`, `/`, `=`, and `-`. Any mismatch
 * exits non-zero without printing the cookie so scanner setup fails fast.
 *
 * The OIDC flow mirrors `tests/integration/global-setup.ts`. Manual
 * redirect handling + per-host cookie jar is used to avoid pulling in a
 * new npm dependency.
 */

import { resolve } from 'node:path'
import { argv, env, exit, stderr, stdout } from 'node:process'
import { fileURLToPath } from 'node:url'
import {
  describeKeycloakLoginFormActionError,
  extractKeycloakLoginFormAction,
} from '../lib/keycloak-login-form.mjs'

export { decodeHtmlEntities } from '../lib/keycloak-login-form.mjs'

const APP_BASE_URL = (env.APP_BASE_URL ?? 'http://localhost:3001').replace(
  /\/$/,
  '',
)
const SESSION_COOKIE_NAME =
  env.AUTH_SESSION_COOKIE_NAME ?? 'kravhantering_session'
const PASSWORD = env.KEYCLOAK_PASSWORD ?? 'devpass'
const MAX_REDIRECTS = 10
export const DEFAULT_FETCH_TIMEOUT_MS = 15_000
const MAX_ABORT_SIGNAL_TIMEOUT_MS = 2_147_483_647
const SAFE_SESSION_COOKIE_OUTPUT_PATTERN =
  /^[A-Za-z0-9_-]+=[A-Za-z0-9._~*+/=-]+$/

export function isSafeSessionCookieOutput(value) {
  const match = SAFE_SESSION_COOKIE_OUTPUT_PATTERN.exec(value)
  return match?.[0] === value
}

export function parseFetchTimeoutMs(value) {
  const normalized = value == null ? '' : String(value).trim()
  if (!normalized) return DEFAULT_FETCH_TIMEOUT_MS

  if (!/^[1-9]\d*$/.test(normalized)) {
    throw new Error(
      'DAST_FETCH_TIMEOUT_MS must be a positive integer number of milliseconds',
    )
  }

  const timeoutMs = Number(normalized)
  if (
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs > MAX_ABORT_SIGNAL_TIMEOUT_MS
  ) {
    throw new Error(
      `DAST_FETCH_TIMEOUT_MS must be no greater than ${MAX_ABORT_SIGNAL_TIMEOUT_MS} milliseconds`,
    )
  }
  return timeoutMs
}

function isTimeoutError(error) {
  return (
    error instanceof Error &&
    (error.name === 'AbortError' || error.name === 'TimeoutError')
  )
}

function sanitizeUrlForLog(url) {
  const parsed = new URL(url)
  parsed.search = ''
  parsed.hash = ''
  return parsed.toString()
}

export async function fetchWithTimeout(
  url,
  init = {},
  { fetchImpl = globalThis.fetch, timeoutMs = DEFAULT_FETCH_TIMEOUT_MS } = {},
) {
  if (typeof fetchImpl !== 'function') {
    throw new Error('fetch is not available in this Node.js runtime')
  }

  const method = String(init.method ?? 'GET').toUpperCase()
  try {
    return await fetchImpl(url, {
      ...init,
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (err) {
    if (isTimeoutError(err)) {
      throw new Error(
        `${method} ${sanitizeUrlForLog(url)} timed out after ${timeoutMs} ms`,
      )
    }
    throw err
  }
}

function fail(message) {
  stderr.write(`[get-session-cookie] ${message}\n`)
  exit(1)
}

/**
 * Per-host cookie jar. Map<hostOrigin, Map<cookieName, cookieValue>>.
 * We only track name=value pairs; attributes (Path, Domain, Secure, etc.)
 * are intentionally ignored because the entire flow happens between two
 * known origins on localhost.
 */
const jar = new Map()

function jarFor(origin) {
  let bag = jar.get(origin)
  if (!bag) {
    bag = new Map()
    jar.set(origin, bag)
  }
  return bag
}

function storeSetCookies(origin, response) {
  const bag = jarFor(origin)
  // Node's fetch exposes multiple Set-Cookie headers via headers.getSetCookie().
  const setCookieHeaders =
    typeof response.headers.getSetCookie === 'function'
      ? response.headers.getSetCookie()
      : []
  for (const raw of setCookieHeaders) {
    const [pair] = raw.split(';')
    const eq = pair.indexOf('=')
    if (eq <= 0) continue
    const name = pair.slice(0, eq).trim()
    const value = pair.slice(eq + 1).trim()
    if (!name) continue
    if (value === '' || value === 'deleted') {
      bag.delete(name)
    } else {
      bag.set(name, value)
    }
  }
}

function cookieHeaderFor(origin) {
  const bag = jar.get(origin)
  if (!bag || bag.size === 0) return undefined
  return Array.from(bag, ([name, value]) => `${name}=${value}`).join('; ')
}

function originOf(url) {
  return new URL(url).origin
}

/**
 * fetch() with manual redirect handling so we can persist cookies set on
 * intermediate hops (Keycloak's AUTH_SESSION_ID, KC_RESTART, the
 * iron-session cookie set by /api/auth/callback, etc.).
 */
async function followingRedirects(
  initialUrl,
  init = {},
  {
    fetchImpl = globalThis.fetch,
    maxRedirects = MAX_REDIRECTS,
    timeoutMs = DEFAULT_FETCH_TIMEOUT_MS,
  } = {},
) {
  let currentUrl = initialUrl
  let currentInit = { ...init, redirect: 'manual' }
  for (let i = 0; i <= maxRedirects; i += 1) {
    const origin = originOf(currentUrl)
    const cookieHeader = cookieHeaderFor(origin)
    const headers = new Headers(currentInit.headers ?? {})
    if (cookieHeader) headers.set('cookie', cookieHeader)
    const response = await fetchWithTimeout(
      currentUrl,
      { ...currentInit, headers },
      { fetchImpl, timeoutMs },
    )
    storeSetCookies(origin, response)

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location')
      if (!location) {
        return { response, finalUrl: currentUrl }
      }
      const nextUrl = new URL(location, currentUrl).toString()
      // RFC 7231: 303 (and most clients for 302) downgrade to GET.
      const method = currentInit.method ?? 'GET'
      const isGetLike =
        response.status === 303 ||
        response.status === 302 ||
        response.status === 301 ||
        method === 'GET'
      currentUrl = nextUrl
      currentInit = isGetLike
        ? { method: 'GET', redirect: 'manual' }
        : { ...currentInit, redirect: 'manual' }
      continue
    }
    return { response, finalUrl: currentUrl }
  }
  throw new Error(
    `Exceeded ${maxRedirects} redirects starting at ${initialUrl}`,
  )
}

async function main() {
  const username = argv[2]
  if (!username) {
    fail('Missing required argument: <username>')
  }
  const fetchTimeoutMs = parseFetchTimeoutMs(env.DAST_FETCH_TIMEOUT_MS)
  // 1. Trigger the OIDC login. /api/auth/login 302s to Keycloak /authorize,
  //    which renders the username/password form.
  const { response: loginPage, finalUrl: loginPageUrl } =
    await followingRedirects(
      `${APP_BASE_URL}/api/auth/login`,
      {},
      {
        timeoutMs: fetchTimeoutMs,
      },
    )
  if (!loginPage.ok) {
    fail(
      `Login flow GET ${APP_BASE_URL}/api/auth/login ended at ${loginPageUrl} with HTTP ${loginPage.status}`,
    )
  }
  const loginHtml = await loginPage.text()
  const formAction = extractKeycloakLoginFormAction(loginHtml)
  if (!formAction) fail(describeKeycloakLoginFormActionError(loginPageUrl))
  const resolvedFormAction = new URL(formAction, loginPageUrl).toString()

  // 2. Submit credentials. Keycloak responds 302 to the app's
  //    /api/auth/callback, which 302s back to / and sets the iron-session
  //    cookie on the app origin.
  const body = new URLSearchParams({
    username,
    password: PASSWORD,
    credentialId: '',
  }).toString()
  const { response: postLogin, finalUrl: postLoginUrl } =
    await followingRedirects(
      resolvedFormAction,
      {
        method: 'POST',
        body,
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
      },
      { timeoutMs: fetchTimeoutMs },
    )
  if (!postLogin.ok) {
    fail(
      `Credential submission for ${username} ended at ${postLoginUrl} with HTTP ${postLogin.status}`,
    )
  }

  // 3. Verify the session is real and grab the iron-session cookie.
  const verify = await fetchWithTimeout(
    `${APP_BASE_URL}/api/auth/me`,
    {
      headers: {
        cookie: cookieHeaderFor(APP_BASE_URL) ?? '',
      },
    },
    { timeoutMs: fetchTimeoutMs },
  )
  const verifyBody = await verify.json().catch(() => ({}))
  if (!verify.ok || verifyBody.authenticated !== true) {
    fail(
      `/api/auth/me reported authenticated=${verifyBody.authenticated} (HTTP ${verify.status}) for ${username}`,
    )
  }

  const sessionValue = jarFor(APP_BASE_URL).get(SESSION_COOKIE_NAME)
  if (!sessionValue) {
    fail(
      `iron-session cookie "${SESSION_COOKIE_NAME}" not found on ${APP_BASE_URL} after login`,
    )
  }

  const sessionCookieOutput = `${SESSION_COOKIE_NAME}=${sessionValue}`
  if (!isSafeSessionCookieOutput(sessionCookieOutput)) {
    fail(
      'Session cookie output does not match the safe name=value charset contract; refusing to print it for scanner injection',
    )
  }

  stdout.write(`${sessionCookieOutput}\n`)
}

const isMainEntry =
  argv[1] != null && resolve(argv[1]) === fileURLToPath(import.meta.url)

if (isMainEntry) {
  main().catch(err => {
    fail(err instanceof Error ? err.message : String(err))
  })
}
