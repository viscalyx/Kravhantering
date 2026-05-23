import net from 'node:net'
import path from 'node:path'
import tls from 'node:tls'
import { fileURLToPath } from 'node:url'
import {
  getSqlServerDatabaseUrl,
  waitForSqlServer,
} from '../db-sqlserver-admin.mjs'

export const DEFAULT_TIMEOUT_MS = 120_000
export const DEFAULT_INTERVAL_MS = 2_000
export const DEFAULT_REQUEST_TIMEOUT_MS = 5_000

export const DEFAULT_URLS = {
  keycloak:
    'https://kravhantering.test/auth/realms/kravhantering-test/.well-known/openid-configuration',
  nginx: 'https://kravhantering.test/',
  health: 'https://kravhantering.test/api/health',
  ready: 'https://kravhantering.test/api/ready',
}

const USAGE = `Usage:
  node scripts/containers/wait-for.mjs <sqlserver|keycloak|nginx|health|ready> [options]

Options:
  --url <url>                 Override the HTTPS URL for HTTP-based checks
  --resolve-host-to <ip>      Resolve the URL hostname to an explicit IP
  --timeout-ms <ms>           Total wait timeout (default 120000)
  --interval-ms <ms>          Delay between attempts (default 2000)
  --request-timeout-ms <ms>   Per-request HTTP timeout (default 5000)`

function parsePositiveInteger(value, fallback, name) {
  if (value == null || value === '') return fallback
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`)
  }
  return parsed
}

export function parseArgs(args) {
  const [command = '', ...rest] = args
  const options = {}

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index]
    if (!arg.startsWith('--')) {
      throw new Error(`Unexpected argument: ${arg}`)
    }

    const key = arg.slice(2)
    const value = rest[index + 1]
    if (!value || value.startsWith('--')) {
      throw new Error(`Missing value for --${key}.`)
    }
    options[key] = value
    index += 1
  }

  return {
    command,
    intervalMs: parsePositiveInteger(
      options['interval-ms'],
      DEFAULT_INTERVAL_MS,
      '--interval-ms',
    ),
    requestTimeoutMs: parsePositiveInteger(
      options['request-timeout-ms'],
      DEFAULT_REQUEST_TIMEOUT_MS,
      '--request-timeout-ms',
    ),
    resolveHostTo: options['resolve-host-to'],
    timeoutMs: parsePositiveInteger(
      options['timeout-ms'],
      DEFAULT_TIMEOUT_MS,
      '--timeout-ms',
    ),
    url: options.url,
  }
}

function sleep(delayMs) {
  return new Promise(resolve => setTimeout(resolve, delayMs))
}

function formatError(error) {
  return error instanceof Error ? error.message : String(error)
}

export function decodeChunkedBody(text) {
  let index = 0
  const chunks = []

  while (index < text.length) {
    const crlfIndex = text.indexOf('\r\n', index)
    const lfIndex = text.indexOf('\n', index)
    const lineEnd =
      crlfIndex >= 0 && (lfIndex < 0 || crlfIndex < lfIndex)
        ? crlfIndex
        : lfIndex
    if (lineEnd < 0) {
      throw new Error('Chunked response ended before the final chunk.')
    }

    const separatorLength = text[lineEnd] === '\r' ? 2 : 1
    const sizeText = text.slice(index, lineEnd).split(';', 1)[0]?.trim()
    const size = Number.parseInt(sizeText ?? '', 16)
    if (!Number.isFinite(size)) {
      throw new Error(`Invalid chunk size: ${sizeText}`)
    }

    index = lineEnd + separatorLength
    if (size === 0) {
      return chunks.join('')
    }

    chunks.push(text.slice(index, index + size))
    index += size
    if (text.slice(index, index + 2) === '\r\n') {
      index += 2
    } else if (text[index] === '\n') {
      index += 1
    }
  }

  throw new Error('Chunked response ended before the final chunk.')
}

export async function waitForCheck(label, check, options = {}) {
  const nowImpl = options.nowImpl ?? Date.now
  const sleepImpl = options.sleepImpl ?? sleep
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS
  const deadline = nowImpl() + timeoutMs
  let attempts = 0
  let lastError

  while (nowImpl() <= deadline) {
    attempts += 1
    try {
      return await check()
    } catch (error) {
      lastError = error
      if (nowImpl() >= deadline) {
        break
      }
      await sleepImpl(intervalMs)
    }
  }

  throw new Error(
    `${label} did not become ready within ${timeoutMs} ms after ${attempts} attempts: ${formatError(lastError)}`,
  )
}

function requestText(url, options = {}) {
  const requestTimeoutMs =
    options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS
  const parsedUrl = new URL(url)
  const isHttps = parsedUrl.protocol === 'https:'
  const port = Number.parseInt(parsedUrl.port || (isHttps ? '443' : '80'), 10)
  const connectHost = options.resolveHostTo ?? parsedUrl.hostname
  const requestPath = `${parsedUrl.pathname}${parsedUrl.search}`

  return new Promise((resolve, reject) => {
    let rawResponse = ''
    let settled = false
    const socket = isHttps
      ? tls.connect({
          host: connectHost,
          port,
          rejectUnauthorized: true,
          servername: parsedUrl.hostname,
          timeout: requestTimeoutMs,
        })
      : net.connect({ host: connectHost, port, timeout: requestTimeoutMs })
    const complete = () => {
      if (settled) return
      settled = true
      const separator = rawResponse.includes('\r\n\r\n') ? '\r\n\r\n' : '\n\n'
      const [headerBlock = '', ...bodyParts] = rawResponse.split(separator)
      const text = /transfer-encoding:\s*chunked/iu.test(headerBlock)
        ? decodeChunkedBody(bodyParts.join(separator))
        : bodyParts.join(separator)
      const status = Number.parseInt(
        headerBlock.match(/^HTTP\/\d(?:\.\d)?\s+(\d+)/u)?.[1] ?? '0',
        10,
      )
      resolve({
        response: {
          ok: status >= 200 && status < 300,
          status,
        },
        text,
      })
    }
    const fail = error => {
      if (settled) return
      settled = true
      reject(error)
    }
    const send = () => {
      socket.write(
        `GET ${requestPath || '/'} HTTP/1.1\r\nHost: ${parsedUrl.host}\r\nAccept: application/json\r\nConnection: close\r\n\r\n`,
      )
    }

    socket.setEncoding('utf8')
    socket.on(isHttps ? 'secureConnect' : 'connect', send)
    socket.on('data', chunk => {
      rawResponse += chunk
    })
    socket.on('end', complete)
    socket.on('error', fail)
    socket.on('timeout', () => {
      socket.destroy(
        new Error(`Request timed out after ${requestTimeoutMs} ms.`),
      )
    })
  })
}

async function fetchText(url, options = {}) {
  if (options.resolveHostTo) {
    return await requestText(url, options)
  }

  const fetchImpl = options.fetchImpl ?? fetch
  const requestTimeoutMs =
    options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS
  const response = await fetchImpl(url, {
    cache: 'no-store',
    headers: { Accept: 'application/json' },
    redirect: options.redirect ?? 'follow',
    signal: AbortSignal.timeout(requestTimeoutMs),
  })
  const text = await response.text()
  return { response, text }
}

function parseJsonBody(text, label) {
  try {
    return JSON.parse(text)
  } catch {
    throw new Error(`${label} returned invalid JSON.`)
  }
}

export async function checkNginx(url = DEFAULT_URLS.nginx, options = {}) {
  const { response } = await fetchText(url, {
    ...options,
    redirect: 'manual',
  })

  return { status: response.status, url }
}

export async function checkOidcDiscovery(
  url = DEFAULT_URLS.keycloak,
  options = {},
) {
  const { response, text } = await fetchText(url, options)
  if (!response.ok) {
    throw new Error(`OIDC discovery returned HTTP ${response.status}.`)
  }

  const metadata = parseJsonBody(text, 'OIDC discovery')
  if (
    typeof metadata !== 'object' ||
    metadata === null ||
    Array.isArray(metadata)
  ) {
    throw new Error('OIDC discovery returned non-object metadata.')
  }

  return { issuer: metadata.issuer, url }
}

export async function checkJsonStatus(url, expectedStatus, options = {}) {
  const { response, text } = await fetchText(url, options)
  if (response.status !== 200) {
    throw new Error(`${url} returned HTTP ${response.status}: ${text}`)
  }

  const body = parseJsonBody(text, url)
  if (body.status !== expectedStatus) {
    throw new Error(
      `${url} returned status "${body.status}", expected "${expectedStatus}".`,
    )
  }

  return { status: body.status, url }
}

export function createSqlServerWaitEnv(env = process.env) {
  return {
    ...env,
    DB_ENCRYPT: env.DB_ENCRYPT ?? 'true',
    DB_HOST: env.DB_HOST ?? '127.0.0.1',
    DB_NAME: env.DB_NAME ?? 'master',
    DB_PASSWORD: env.DB_PASSWORD ?? env.MSSQL_SA_PASSWORD,
    DB_PORT: env.DB_PORT ?? '1433',
    DB_TRUST_SERVER_CERTIFICATE: env.DB_TRUST_SERVER_CERTIFICATE ?? 'true',
    DB_USER: env.DB_USER ?? (env.MSSQL_SA_PASSWORD ? 'sa' : undefined),
  }
}

export function createMasterConnectionString(connectionString) {
  const url = new URL(connectionString)
  url.pathname = '/master'
  return url.toString()
}

export async function waitForSqlServerProbe(options = {}) {
  const env = createSqlServerWaitEnv(options.env ?? process.env)
  const connectionString = createMasterConnectionString(
    getSqlServerDatabaseUrl(env, { readonly: false }),
  )

  return await waitForSqlServer(connectionString, {
    ...options,
    env,
    retryDelayMs: options.intervalMs ?? DEFAULT_INTERVAL_MS,
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  })
}

export function createHttpCheck(command, url, options = {}) {
  if (command === 'nginx') {
    return () => checkNginx(url ?? DEFAULT_URLS.nginx, options)
  }
  if (command === 'keycloak') {
    return () => checkOidcDiscovery(url ?? DEFAULT_URLS.keycloak, options)
  }
  if (command === 'health') {
    return () => checkJsonStatus(url ?? DEFAULT_URLS.health, 'ok', options)
  }
  if (command === 'ready') {
    return () => checkJsonStatus(url ?? DEFAULT_URLS.ready, 'ready', options)
  }

  throw new Error(`Unsupported wait target: ${command}`)
}

export async function runWaitCommand(parsed, dependencies = {}) {
  if (parsed.command === 'sqlserver') {
    return await waitForSqlServerProbe({
      env: dependencies.env,
      healthCheckImpl: dependencies.healthCheckImpl,
      intervalMs: parsed.intervalMs,
      nowImpl: dependencies.nowImpl,
      sleepImpl: dependencies.sleepImpl,
      timeoutMs: parsed.timeoutMs,
    })
  }

  return await waitForCheck(
    parsed.command,
    createHttpCheck(parsed.command, parsed.url, {
      fetchImpl: dependencies.fetchImpl,
      requestTimeoutMs: parsed.requestTimeoutMs,
      resolveHostTo: parsed.resolveHostTo,
    }),
    {
      intervalMs: parsed.intervalMs,
      nowImpl: dependencies.nowImpl,
      sleepImpl: dependencies.sleepImpl,
      timeoutMs: parsed.timeoutMs,
    },
  )
}

export async function main(args, dependencies = {}) {
  const consoleObj = dependencies.consoleObj ?? console

  try {
    const parsed = parseArgs(args)
    if (
      !['sqlserver', 'keycloak', 'nginx', 'health', 'ready'].includes(
        parsed.command,
      )
    ) {
      consoleObj.error(USAGE)
      return 1
    }

    await runWaitCommand(parsed, dependencies)
    consoleObj.log(`${parsed.command} is ready.`)
    return 0
  } catch (error) {
    consoleObj.error(error instanceof Error ? error.message : String(error))
    return 1
  }
}

const isDirectRun =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isDirectRun) {
  process.exitCode = await main(process.argv.slice(2))
}
