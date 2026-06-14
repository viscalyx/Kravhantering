import { readFile, stat } from 'node:fs/promises'
import http from 'node:http'
import https from 'node:https'
import { isHsaId } from '@/lib/auth/hsa-id'
import {
  conflictError,
  isRequirementsServiceError,
  serviceUnavailableError,
  validationError,
} from '@/lib/requirements/errors'
import type { RequirementResponsibilityPersonRecord } from '@/lib/requirements/responsibility-person'

const DEFAULT_TIMEOUT_MS = 5000
const OAUTH_CACHE_SKEW_MS = 60_000
const LOOKUP_REASON = {
  conflict: 'hsa_lookup_conflict',
  invalidResponse: 'hsa_lookup_invalid_response',
  missingConfig: 'hsa_lookup_missing_config',
  notFound: 'hsa_lookup_not_found',
  timeout: 'hsa_lookup_timeout',
  unavailable: 'hsa_lookup_unavailable',
} as const

export interface HsaPersonLookupMtlsConfig {
  caPath?: string
  certPath: string
  keyPath: string
  serverName?: string
}

export interface HsaPersonLookupOAuthConfig {
  audience?: string
  clientId: string
  clientSecret: string
  issuerUrl?: string
  scope?: string
  tokenUrl?: string
}

export interface HsaPersonLookupConfig {
  mtls?: HsaPersonLookupMtlsConfig
  oauth?: HsaPersonLookupOAuthConfig
  timeoutMs: number
  url: string
}

interface HttpRequestInput {
  body?: string
  headers?: Record<string, string>
  method: string
  mtls?: HsaPersonLookupMtlsConfig
  signal?: AbortSignal
  timeoutMs: number
  url: string
}

interface HttpResponse {
  body: string
  headers: http.IncomingHttpHeaders
  status: number
}

type HttpRequestImpl = (input: HttpRequestInput) => Promise<HttpResponse>

interface LookupOptions {
  config?: HsaPersonLookupConfig
  fetchImpl?: typeof fetch
  httpRequestImpl?: HttpRequestImpl
}

interface CachedOAuthToken {
  accessToken: string
  expiresAt: number
}

interface CachedTlsFile {
  content: Buffer
  mtimeMs: number
}

class HsaPersonLookupConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'HsaPersonLookupConfigError'
  }
}

const oauthTokenCache = new Map<string, CachedOAuthToken>()
const tlsFileCache = new Map<string, CachedTlsFile>()

function parseTimeout(value: string | undefined): number {
  if (!value) return DEFAULT_TIMEOUT_MS
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_TIMEOUT_MS
  return Math.min(Math.trunc(parsed), 30_000)
}

function envString(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const value = env[name]?.trim()
  return value ? value : undefined
}

function oauthConfigFromEnv(
  env: NodeJS.ProcessEnv,
): HsaPersonLookupOAuthConfig | undefined {
  const tokenUrl = envString(env, 'HSA_PERSON_LOOKUP_OAUTH_TOKEN_URL')
  const issuerUrl = envString(env, 'HSA_PERSON_LOOKUP_OAUTH_ISSUER_URL')
  const clientId = envString(env, 'HSA_PERSON_LOOKUP_OAUTH_CLIENT_ID')
  const clientSecret = envString(env, 'HSA_PERSON_LOOKUP_OAUTH_CLIENT_SECRET')
  const audience = envString(env, 'HSA_PERSON_LOOKUP_OAUTH_AUDIENCE')
  const scope = envString(env, 'HSA_PERSON_LOOKUP_OAUTH_SCOPE')
  const anyOAuth =
    tokenUrl || issuerUrl || clientId || clientSecret || audience || scope
  if (!anyOAuth) return undefined
  if (!clientId || !clientSecret || (!tokenUrl && !issuerUrl)) {
    throw new HsaPersonLookupConfigError(
      'HSA lookup OAuth2 configuration requires client id, client secret, and token URL or issuer URL.',
    )
  }

  return {
    ...(audience ? { audience } : {}),
    clientId,
    clientSecret,
    ...(issuerUrl ? { issuerUrl } : {}),
    ...(scope ? { scope } : {}),
    ...(tokenUrl ? { tokenUrl } : {}),
  }
}

function mtlsConfigFromEnv(
  env: NodeJS.ProcessEnv,
): HsaPersonLookupMtlsConfig | undefined {
  const certPath = envString(env, 'HSA_PERSON_LOOKUP_CLIENT_CERT_PATH')
  const keyPath = envString(env, 'HSA_PERSON_LOOKUP_CLIENT_KEY_PATH')
  const caPath = envString(env, 'HSA_PERSON_LOOKUP_CA_PATH')
  const anyMtls = certPath || keyPath || caPath
  if (!anyMtls) return undefined
  if (!certPath || !keyPath) {
    throw new HsaPersonLookupConfigError(
      'HSA lookup mTLS configuration requires both client certificate and client key paths.',
    )
  }

  const serverName = envString(env, 'HSA_PERSON_LOOKUP_TLS_SERVER_NAME')
  return {
    ...(caPath ? { caPath } : {}),
    certPath,
    keyPath,
    ...(serverName ? { serverName } : {}),
  }
}

export function getHsaPersonLookupConfig(
  env: NodeJS.ProcessEnv = process.env,
): HsaPersonLookupConfig | null {
  const url = env.HSA_PERSON_LOOKUP_URL?.trim()
  if (!url) return null
  const mtls = mtlsConfigFromEnv(env)
  const oauth = oauthConfigFromEnv(env)
  return {
    ...(mtls ? { mtls } : {}),
    ...(oauth ? { oauth } : {}),
    timeoutMs: parseTimeout(env.HSA_PERSON_LOOKUP_TIMEOUT_MS),
    url,
  }
}

function stringField(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function nullableStringField(value: unknown): string | null {
  return value == null ? null : stringField(value)
}

function booleanField(value: unknown): boolean {
  return value === true
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text()
  return parseJsonText(text)
}

function parseJsonText(text: string): unknown {
  if (!text.trim()) return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function normalizePayload(
  payload: unknown,
  requestedHsaId: string,
): RequirementResponsibilityPersonRecord {
  if (!payload || typeof payload !== 'object') {
    throw serviceUnavailableError('HSA lookup returned an invalid response', {
      reason: LOOKUP_REASON.invalidResponse,
    })
  }

  const data = payload as Record<string, unknown>
  const hsaId = stringField(data.hsaId)
  const givenName = stringField(data.givenName)
  if (!hsaId || !givenName) {
    throw serviceUnavailableError('HSA lookup returned an invalid response', {
      reason: LOOKUP_REASON.invalidResponse,
    })
  }
  if (hsaId !== requestedHsaId) {
    throw conflictError('HSA lookup returned a different identity', {
      reason: LOOKUP_REASON.conflict,
    })
  }

  return {
    email: nullableStringField(data.email),
    givenName,
    hasProtectedPersonalData: booleanField(data.hasProtectedPersonalData),
    hsaId,
    middleName: nullableStringField(data.middleName),
    surname: nullableStringField(data.surname),
  }
}

function mapLookupHttpError(status: number, payload: unknown): never {
  const code =
    payload && typeof payload === 'object'
      ? stringField((payload as Record<string, unknown>).code)
      : null
  if (code === 'not_found') {
    throw validationError('HSA-id was not found in the HSA directory', {
      reason: LOOKUP_REASON.notFound,
    })
  }
  if (status === 409 || code === 'conflict') {
    throw conflictError('HSA lookup returned conflicting person records', {
      reason: LOOKUP_REASON.conflict,
    })
  }
  throw serviceUnavailableError('HSA lookup service is unavailable', {
    reason: LOOKUP_REASON.unavailable,
  })
}

function cacheKeyForOAuth(
  oauth: HsaPersonLookupOAuthConfig,
  mtls?: HsaPersonLookupMtlsConfig,
): string {
  return JSON.stringify({
    audience: oauth.audience ?? null,
    clientId: oauth.clientId,
    issuerUrl: oauth.issuerUrl ?? null,
    mtls: mtls
      ? {
          caPath: mtls.caPath ?? null,
          certPath: mtls.certPath,
          keyPath: mtls.keyPath,
          serverName: mtls.serverName ?? null,
        }
      : null,
    scope: oauth.scope ?? null,
    tokenUrl: oauth.tokenUrl ?? null,
  })
}

async function cachedReadFile(filePath: string): Promise<Buffer> {
  const fileStat = await stat(filePath)
  const cached = tlsFileCache.get(filePath)
  if (cached && cached.mtimeMs === fileStat.mtimeMs) return cached.content
  const content = await readFile(filePath)
  tlsFileCache.set(filePath, { content, mtimeMs: fileStat.mtimeMs })
  return content
}

async function tlsOptions(
  mtls?: HsaPersonLookupMtlsConfig,
): Promise<https.RequestOptions> {
  if (!mtls) return {}
  return {
    ...(mtls.caPath ? { ca: await cachedReadFile(mtls.caPath) } : {}),
    cert: await cachedReadFile(mtls.certPath),
    key: await cachedReadFile(mtls.keyPath),
    ...(mtls.serverName ? { servername: mtls.serverName } : {}),
  }
}

function executeHttpRequest(input: HttpRequestInput): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(input.url)
    const isHttps = parsed.protocol === 'https:'
    if (!isHttps && parsed.protocol !== 'http:') {
      reject(new Error(`Unsupported URL protocol: ${parsed.protocol}`))
      return
    }
    if (!isHttps && input.mtls) {
      reject(new Error('HSA lookup mTLS requires an HTTPS URL.'))
      return
    }

    let settled = false
    const finish = (callback: () => void) => {
      if (settled) return
      settled = true
      callback()
    }

    void tlsOptions(isHttps ? input.mtls : undefined)
      .then(tls => {
        const requestOptions: http.RequestOptions & https.RequestOptions = {
          ...tls,
          headers: {
            ...input.headers,
            ...(input.body
              ? { 'Content-Length': Buffer.byteLength(input.body).toString() }
              : {}),
          },
          hostname: parsed.hostname,
          method: input.method,
          path: `${parsed.pathname}${parsed.search}`,
          port: parsed.port ? Number(parsed.port) : isHttps ? 443 : 80,
          signal: input.signal,
          timeout: input.timeoutMs,
        }
        const transport = isHttps ? https : http
        const req = transport.request(requestOptions, response => {
          const chunks: Buffer[] = []
          response.on('data', chunk => {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
          })
          response.on('end', () => {
            finish(() =>
              resolve({
                body: Buffer.concat(chunks).toString('utf8'),
                headers: response.headers,
                status: response.statusCode ?? 0,
              }),
            )
          })
        })

        req.on('timeout', () => {
          req.destroy(new DOMException('timeout', 'AbortError'))
        })
        req.on('error', error => {
          finish(() => reject(error))
        })
        if (input.body) req.write(input.body)
        req.end()
      })
      .catch(error => finish(() => reject(error)))
  })
}

async function resolveTokenUrl(
  oauth: HsaPersonLookupOAuthConfig,
  requestImpl: HttpRequestImpl,
  config: HsaPersonLookupConfig,
  signal: AbortSignal,
): Promise<string> {
  if (oauth.tokenUrl) return oauth.tokenUrl
  if (!oauth.issuerUrl) {
    throw new Error('OAuth issuer URL or token URL is required.')
  }
  const issuer = oauth.issuerUrl.replace(/\/+$/u, '')
  const response = await requestImpl({
    headers: { Accept: 'application/json' },
    method: 'GET',
    mtls: config.mtls,
    signal,
    timeoutMs: config.timeoutMs,
    url: `${issuer}/.well-known/openid-configuration`,
  })
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`OIDC discovery failed with ${response.status}.`)
  }
  const payload = parseJsonText(response.body)
  const tokenEndpoint =
    payload && typeof payload === 'object'
      ? stringField((payload as Record<string, unknown>).token_endpoint)
      : null
  if (!tokenEndpoint) {
    throw new Error('OIDC discovery response did not include token_endpoint.')
  }
  return tokenEndpoint
}

async function getOAuthAccessToken(
  config: HsaPersonLookupConfig,
  requestImpl: HttpRequestImpl,
  signal: AbortSignal,
): Promise<string | null> {
  const oauth = config.oauth
  if (!oauth) return null

  const cacheKey = cacheKeyForOAuth(oauth, config.mtls)
  const now = Date.now()
  const cached = oauthTokenCache.get(cacheKey)
  if (cached && cached.expiresAt - OAUTH_CACHE_SKEW_MS > now) {
    return cached.accessToken
  }

  const tokenUrl = await resolveTokenUrl(oauth, requestImpl, config, signal)
  const form = new URLSearchParams()
  form.set('grant_type', 'client_credentials')
  if (oauth.scope) form.set('scope', oauth.scope)
  if (oauth.audience) form.set('audience', oauth.audience)

  const response = await requestImpl({
    body: form.toString(),
    headers: {
      Accept: 'application/json',
      Authorization: `Basic ${Buffer.from(`${oauth.clientId}:${oauth.clientSecret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    method: 'POST',
    mtls: config.mtls,
    signal,
    timeoutMs: config.timeoutMs,
    url: tokenUrl,
  })
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`OAuth token request failed with ${response.status}.`)
  }
  const payload = parseJsonText(response.body)
  const accessToken =
    payload && typeof payload === 'object'
      ? stringField((payload as Record<string, unknown>).access_token)
      : null
  if (!accessToken) {
    throw new Error('OAuth token response did not include access_token.')
  }
  const expiresInRaw =
    payload && typeof payload === 'object'
      ? (payload as Record<string, unknown>).expires_in
      : null
  const expiresIn =
    typeof expiresInRaw === 'number' && Number.isFinite(expiresInRaw)
      ? expiresInRaw
      : 300
  oauthTokenCache.set(cacheKey, {
    accessToken,
    expiresAt: now + Math.max(1, expiresIn) * 1000,
  })
  return accessToken
}

async function postLookupWithHttpRequest(
  config: HsaPersonLookupConfig,
  hsaId: string,
  requestImpl: HttpRequestImpl,
  signal: AbortSignal,
): Promise<{ ok: boolean; payload: unknown; status: number }> {
  const accessToken = await getOAuthAccessToken(config, requestImpl, signal)
  const response = await requestImpl({
    body: JSON.stringify({ hsaId }),
    headers: {
      Accept: 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      'Content-Type': 'application/json',
    },
    method: 'POST',
    mtls: config.mtls,
    signal,
    timeoutMs: config.timeoutMs,
    url: config.url,
  })
  return {
    ok: response.status >= 200 && response.status < 300,
    payload: parseJsonText(response.body),
    status: response.status,
  }
}

export async function lookupHsaPerson(
  hsaId: string,
  options: LookupOptions = {},
): Promise<RequirementResponsibilityPersonRecord> {
  if (!isHsaId(hsaId)) {
    throw validationError('Invalid HSA-id format', {
      reason: 'invalid_hsa_id',
    })
  }

  const controller = new AbortController()
  let timeout: ReturnType<typeof setTimeout> | null = null
  try {
    const config = options.config ?? getHsaPersonLookupConfig()
    if (!config) {
      throw serviceUnavailableError('HSA lookup URL is not configured', {
        reason: LOOKUP_REASON.missingConfig,
      })
    }
    timeout = setTimeout(() => controller.abort(), config.timeoutMs)
    const response =
      config.mtls || config.oauth
        ? await postLookupWithHttpRequest(
            config,
            hsaId,
            options.httpRequestImpl ?? executeHttpRequest,
            controller.signal,
          )
        : await (async () => {
            const fetchResponse = await (options.fetchImpl ?? fetch)(
              config.url,
              {
                body: JSON.stringify({ hsaId }),
                headers: { 'Content-Type': 'application/json' },
                method: 'POST',
                signal: controller.signal,
              },
            )
            return {
              ok: fetchResponse.ok,
              payload: await readJson(fetchResponse),
              status: fetchResponse.status,
            }
          })()
    if (!response.ok) mapLookupHttpError(response.status, response.payload)
    return normalizePayload(response.payload, hsaId)
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw serviceUnavailableError('HSA lookup service timed out', {
        reason: LOOKUP_REASON.timeout,
      })
    }
    if (isRequirementsServiceError(error)) {
      throw error
    }
    throw serviceUnavailableError('HSA lookup service is unavailable', {
      reason: LOOKUP_REASON.unavailable,
    })
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}

export function resetHsaPersonLookupAuthCacheForTests(): void {
  oauthTokenCache.clear()
  tlsFileCache.clear()
}

export async function readHsaPersonLookupTlsFileForTests(
  filePath: string,
): Promise<Buffer> {
  return cachedReadFile(filePath)
}
