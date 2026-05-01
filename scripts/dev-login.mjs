#!/usr/bin/env node
/**
 * Dev helper: log in to the local Keycloak IdP as a configured dev user
 * and emit a Netscape-format cookie jar suitable for `curl -b`.
 *
 * Mirrors the OIDC flow in tests/integration/global-setup.ts but uses
 * only Node's built-in fetch so it can run without Playwright installed.
 *
 * Usage:
 *   node scripts/dev-login.mjs                     # default: ada.admin
 *   node scripts/dev-login.mjs --user rita.reviewer
 *   node scripts/dev-login.mjs --base http://localhost:3000
 *   node scripts/dev-login.mjs --jar .auth/admin.cookies
 *   node scripts/dev-login.mjs --print-jar         # only print jar path
 *
 * Prints the absolute path to the cookie jar on stdout, so you can do:
 *   jar=$(node scripts/dev-login.mjs) && curl -b "$jar" \
 *     http://localhost:3000/sv/requirements/IDN0001/4
 *
 * Or use the convenience wrapper: scripts/dev-curl.sh
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const KNOWN_USERS = {
  'ada.admin': 'devpass',
  'rita.reviewer': 'devpass',
}

function parseArgs(argv) {
  const args = {
    user: 'ada.admin',
    password: undefined,
    base: process.env.DEV_LOGIN_BASE_URL ?? 'http://localhost:3000',
    jar: undefined,
    force: false,
    printJar: false,
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--user' || a === '-u') args.user = argv[++i]
    else if (a === '--password' || a === '-p') args.password = argv[++i]
    else if (a === '--base' || a === '-b')
      args.base = argv[++i].replace(/\/$/, '')
    else if (a === '--jar' || a === '-j') args.jar = argv[++i]
    else if (a === '--force' || a === '-f') args.force = true
    else if (a === '--print-jar') args.printJar = true
    else if (a === '--help' || a === '-h') {
      process.stdout.write(
        'Usage: node scripts/dev-login.mjs [--user ada.admin] [--password devpass]\n' +
          '                                  [--base http://localhost:3000] [--jar PATH]\n' +
          '                                  [--force] [--print-jar]\n',
      )
      process.exit(0)
    } else {
      throw new Error(`Unknown argument: ${a}`)
    }
  }
  if (!args.password) args.password = KNOWN_USERS[args.user] ?? 'devpass'
  if (!args.jar) args.jar = `.auth/${args.user}.cookies`
  return args
}

function decodeHtmlEntities(value) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#x2F;/g, '/')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

/** Minimal cookie jar keyed by `${domain}|${path}|${name}`. */
class CookieJar {
  constructor() {
    this.cookies = new Map()
  }

  /**
   * Ingest Set-Cookie headers from a fetch Response. Uses the request URL
   * to fill in default Domain/Path. Honors Expires/Max-Age for purging.
   */
  ingest(response, requestUrl) {
    const url = new URL(requestUrl)
    // Node's fetch exposes raw Set-Cookie via getSetCookie().
    const raw = response.headers.getSetCookie?.() ?? []
    for (const line of raw) this.#addOne(line, url)
  }

  #addOne(line, requestUrl) {
    const parts = line.split(';').map(p => p.trim())
    const [nameValue, ...attrs] = parts
    const eq = nameValue.indexOf('=')
    if (eq < 0) return
    const name = nameValue.slice(0, eq).trim()
    const value = nameValue.slice(eq + 1).trim()

    let domain = requestUrl.hostname
    let path = '/'
    let secure = false
    let httpOnly = false
    let expires = null
    let maxAge = null

    for (const attr of attrs) {
      const [rawKey, ...rest] = attr.split('=')
      const key = rawKey.toLowerCase().trim()
      const val = rest.join('=').trim()
      if (key === 'domain' && val) domain = val.replace(/^\./, '')
      else if (key === 'path' && val) path = val
      else if (key === 'secure') secure = true
      else if (key === 'httponly') httpOnly = true
      else if (key === 'expires' && val) expires = new Date(val).getTime()
      else if (key === 'max-age' && val) maxAge = Number(val)
    }

    const expiry = maxAge != null ? Date.now() + maxAge * 1000 : (expires ?? 0)

    const key = `${domain}|${path}|${name}`
    if (maxAge === 0 || (expiry > 0 && expiry < Date.now())) {
      this.cookies.delete(key)
      return
    }
    this.cookies.set(key, {
      name,
      value,
      domain,
      path,
      secure,
      httpOnly,
      expiry,
    })
  }

  /** Build a Cookie header for the given request URL. */
  header(requestUrl) {
    const url = new URL(requestUrl)
    const matches = []
    for (const c of this.cookies.values()) {
      if (!hostMatches(url.hostname, c.domain)) continue
      if (!url.pathname.startsWith(c.path)) continue
      // Note: we intentionally ignore the Secure flag. The local Keycloak
      // dev realm serves cookies with Secure;SameSite=None even over HTTP
      // on localhost, and a strict browser-style check would drop them.
      if (c.expiry > 0 && c.expiry < Date.now()) continue
      matches.push(`${c.name}=${c.value}`)
    }
    return matches.join('; ')
  }

  /** Serialize as Netscape cookies.txt for `curl -b`. */
  toNetscape() {
    const lines = [
      '# Netscape HTTP Cookie File',
      '# Generated by scripts/dev-login.mjs',
    ]
    for (const c of this.cookies.values()) {
      const domainField = c.domain
      const includeSubdomains = 'FALSE'
      const secure = c.secure ? 'TRUE' : 'FALSE'
      const expiry = c.expiry > 0 ? Math.floor(c.expiry / 1000) : 0
      lines.push(
        [
          domainField,
          includeSubdomains,
          c.path,
          secure,
          String(expiry),
          c.name,
          c.value,
        ].join('\t'),
      )
    }
    return `${lines.join('\n')}\n`
  }
}

function hostMatches(reqHost, cookieHost) {
  if (reqHost === cookieHost) return true
  if (reqHost.endsWith(`.${cookieHost}`)) return true
  return false
}

/** fetch wrapper that records cookies and never auto-follows redirects. */
async function step(jar, url, init = {}) {
  const headers = new Headers(init.headers ?? {})
  const cookieHeader = jar.header(url)
  if (cookieHeader) headers.set('cookie', cookieHeader)
  if (process.env.DEV_LOGIN_DEBUG) {
    process.stderr.write(
      `[dev-login] -> ${init.method ?? 'GET'} ${url} cookies=${cookieHeader}\n`,
    )
  }
  const response = await fetch(url, { ...init, headers, redirect: 'manual' })
  if (process.env.DEV_LOGIN_DEBUG) {
    process.stderr.write(
      `[dev-login]   <- ${response.status} ${response.headers.get('location') ?? ''}\n`,
    )
  }
  jar.ingest(response, url)
  return response
}

/** Follow Location-based redirects manually until a non-3xx is reached. */
async function followRedirects(jar, response, currentUrl, maxHops = 12) {
  let res = response
  let url = currentUrl
  let hops = 0
  while (res.status >= 300 && res.status < 400) {
    if (hops++ >= maxHops) {
      throw new Error(`Too many redirects starting from ${currentUrl}`)
    }
    const location = res.headers.get('location')
    if (!location) return { res, url }
    const nextUrl = new URL(location, url).toString()
    res = await step(jar, nextUrl)
    url = nextUrl
  }
  return { res, url }
}

async function login({ base, user, password }) {
  const jar = new CookieJar()

  // 1. Hit /api/auth/login -> redirected to Keycloak /authorize -> login form.
  const loginStart = await step(jar, `${base}/api/auth/login`)
  const { res: loginPage } = await followRedirects(
    jar,
    loginStart,
    `${base}/api/auth/login`,
  )
  if (!loginPage.ok) {
    throw new Error(
      `Failed to load Keycloak login form: ${loginPage.status} ${loginPage.statusText}`,
    )
  }
  const loginHtml = await loginPage.text()
  const formTagMatch = loginHtml.match(
    /<form\b[^>]*\bid="kc-form-login"[^>]*>/i,
  )
  const actionMatch = formTagMatch?.[0].match(/\baction="([^"]+)"/i)
  if (!actionMatch) {
    throw new Error('Could not find Keycloak login form in response')
  }
  const formAction = decodeHtmlEntities(actionMatch[1])

  // 2. POST credentials. Keycloak then redirects via 302 chain back to the app.
  const credResponse = await step(jar, formAction, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ username: user, password, credentialId: '' }),
  })
  const { res: finalRes, url: finalUrl } = await followRedirects(
    jar,
    credResponse,
    formAction,
  )
  if (!finalRes.ok && finalRes.status !== 302) {
    throw new Error(
      `Login chain ended with ${finalRes.status} ${finalRes.statusText} at ${finalUrl}`,
    )
  }

  // 3. Verify with /api/auth/me.
  const meRes = await step(jar, `${base}/api/auth/me`)
  const meBody = await meRes.json()
  if (!meBody.authenticated) {
    throw new Error(
      `Login finished but /api/auth/me reported authenticated=false for ${user}`,
    )
  }

  return jar
}

async function isJarStillValid(jarPath, base) {
  if (!existsSync(jarPath)) return false
  const text = readFileSync(jarPath, 'utf8')
  const cookies = text
    .split('\n')
    .filter(line => line && !line.startsWith('#'))
    .map(line => line.split('\t'))
    .filter(parts => parts.length >= 7)
  const header = cookies.map(parts => `${parts[5]}=${parts[6]}`).join('; ')
  if (!header) return false
  try {
    const res = await fetch(`${base}/api/auth/me`, {
      headers: { cookie: header },
      redirect: 'manual',
    })
    if (!res.ok) return false
    const body = await res.json()
    return Boolean(body.authenticated)
  } catch {
    return false
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const jarPath = resolve(process.cwd(), args.jar)

  if (args.printJar) {
    process.stdout.write(`${jarPath}\n`)
    return
  }

  if (!args.force && (await isJarStillValid(jarPath, args.base))) {
    process.stderr.write(`[dev-login] Reusing valid session at ${jarPath}\n`)
    process.stdout.write(`${jarPath}\n`)
    return
  }

  process.stderr.write(
    `[dev-login] Logging in as ${args.user} at ${args.base} ...\n`,
  )
  const jar = await login({
    base: args.base,
    user: args.user,
    password: args.password,
  })
  mkdirSync(dirname(jarPath), { recursive: true })
  writeFileSync(jarPath, jar.toNetscape(), { mode: 0o600 })
  process.stderr.write(`[dev-login] Wrote cookie jar to ${jarPath}\n`)
  process.stdout.write(`${jarPath}\n`)
}

main().catch(err => {
  process.stderr.write(`[dev-login] ${err?.stack ?? err}\n`)
  process.exit(1)
})
