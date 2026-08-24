import https from 'node:https'
import net from 'node:net'
import { checkServerIdentity } from 'node:tls'
import { isHsaId } from '@/lib/auth/hsa-id'
import { createHsaCorrelationId } from '@/lib/hsa/correlation.mjs'
import {
  loadStrictCertificateAuthority,
  loadStrictTlsSnapshot,
  strictCertificateAuthorityRawValues,
} from '@/lib/hsa/strict-tls'
import {
  conflictError,
  isRequirementsServiceError,
  serviceUnavailableError,
  validationError,
} from '@/lib/requirements/errors'
import type { RequirementResponsibilityPersonRecord } from '@/lib/requirements/responsibility-person'

const MAX_RESPONSE_BYTES = 64 * 1024
const DEFAULT_TIMEOUT_MS = 5000
const CORRELATION_HEADER = 'X-Kravhantering-HSA-Correlation-ID'

export type StrictHsaPersonLookupDiagnostic =
  | 'hsa_strict_auth_requires_url'
  | 'hsa_strict_mtls_incomplete'
  | 'hsa_strict_oauth_incomplete'
  | 'hsa_strict_oauth_trust_reused'
  | 'hsa_strict_oauth_url_invalid'
  | 'hsa_strict_server_identity_invalid'
  | 'hsa_strict_timeout_invalid'
  | 'hsa_strict_url_invalid'

class StrictHsaPersonLookupError extends Error {
  readonly diagnostic: StrictHsaPersonLookupDiagnostic

  constructor(diagnostic: StrictHsaPersonLookupDiagnostic, message: string) {
    super(message)
    this.name = 'StrictHsaPersonLookupError'
    this.diagnostic = diagnostic
  }
}

export function strictHsaPersonLookupDiagnostic(
  error: unknown,
): StrictHsaPersonLookupDiagnostic | null {
  return error instanceof StrictHsaPersonLookupError ? error.diagnostic : null
}

function envValue(env: NodeJS.ProcessEnv, name: string): string | undefined {
  return env[name]?.trim() || undefined
}

function requiredHttpsUrl(
  value: string,
  diagnostic: StrictHsaPersonLookupDiagnostic,
): string {
  try {
    const url = new URL(value)
    if (
      url.protocol !== 'https:' ||
      (url.port !== '' && Number(url.port) < 1)
    ) {
      throw new Error('url')
    }
    return url.toString()
  } catch {
    throw new StrictHsaPersonLookupError(
      diagnostic,
      'Strict HSA endpoint must be an HTTPS URL.',
    )
  }
}

function validateServerName(value: string): void {
  if (
    value === 'localhost' ||
    value.includes('*') ||
    net.isIP(value) !== 0 ||
    !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/u.test(value)
  ) {
    throw new StrictHsaPersonLookupError(
      'hsa_strict_server_identity_invalid',
      'Strict HSA TLS server identity must be one exact DNS name.',
    )
  }
}

function timeoutFromEnv(env: NodeJS.ProcessEnv): number {
  const value = envValue(env, 'HSA_PERSON_LOOKUP_TIMEOUT_MS')
  if (!value) return DEFAULT_TIMEOUT_MS
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 30_000) {
    throw new StrictHsaPersonLookupError(
      'hsa_strict_timeout_invalid',
      'Strict HSA lookup timeout must be between 1 and 30000 milliseconds.',
    )
  }
  return parsed
}

export interface StrictHsaPersonLookupSnapshot {
  endpointUrl: string
  oauth?: {
    audience?: string
    ca?: Buffer
    clientId: string
    clientSecret: string
    issuerUrl?: string
    scope?: string
    tokenUrl?: string
  }
  timeoutMs: number
  tls: {
    ca: Buffer
    cert: Buffer
    key: Buffer
    serverName: string
  }
}

export async function loadStrictHsaPersonLookupSnapshot(
  env: NodeJS.ProcessEnv = process.env,
): Promise<StrictHsaPersonLookupSnapshot | null> {
  const endpointUrl = envValue(env, 'HSA_PERSON_LOOKUP_URL')
  const caPath = envValue(env, 'HSA_PERSON_LOOKUP_CA_PATH')
  const certPath = envValue(env, 'HSA_PERSON_LOOKUP_CLIENT_CERT_PATH')
  const keyPath = envValue(env, 'HSA_PERSON_LOOKUP_CLIENT_KEY_PATH')
  const serverName = envValue(env, 'HSA_PERSON_LOOKUP_TLS_SERVER_NAME')
  const oauthCaPath = envValue(env, 'HSA_PERSON_LOOKUP_OAUTH_CA_PATH')
  const oauthTokenUrl = envValue(env, 'HSA_PERSON_LOOKUP_OAUTH_TOKEN_URL')
  const oauthIssuerUrl = envValue(env, 'HSA_PERSON_LOOKUP_OAUTH_ISSUER_URL')
  const oauthClientId = envValue(env, 'HSA_PERSON_LOOKUP_OAUTH_CLIENT_ID')
  const oauthClientSecret = envValue(
    env,
    'HSA_PERSON_LOOKUP_OAUTH_CLIENT_SECRET',
  )
  const oauthAudience = envValue(env, 'HSA_PERSON_LOOKUP_OAUTH_AUDIENCE')
  const oauthScope = envValue(env, 'HSA_PERSON_LOOKUP_OAUTH_SCOPE')
  const anyTls = caPath || certPath || keyPath || serverName
  const anyOAuth =
    oauthCaPath ||
    oauthTokenUrl ||
    oauthIssuerUrl ||
    oauthClientId ||
    oauthClientSecret ||
    oauthAudience ||
    oauthScope
  if (!endpointUrl) {
    if (anyTls || anyOAuth) {
      throw new StrictHsaPersonLookupError(
        'hsa_strict_auth_requires_url',
        'Strict HSA authentication settings require a lookup URL.',
      )
    }
    return null
  }
  if (!caPath || !certPath || !keyPath || !serverName) {
    throw new StrictHsaPersonLookupError(
      'hsa_strict_mtls_incomplete',
      'Strict HSA lookup requires the complete mTLS tuple.',
    )
  }
  validateServerName(serverName)
  const tls = await loadStrictTlsSnapshot({
    caPath,
    certPath,
    keyPath,
    role: 'client',
  })
  let oauth: StrictHsaPersonLookupSnapshot['oauth']
  if (anyOAuth) {
    if (
      !oauthClientId ||
      !oauthClientSecret ||
      (!oauthTokenUrl && !oauthIssuerUrl)
    ) {
      throw new StrictHsaPersonLookupError(
        'hsa_strict_oauth_incomplete',
        'Strict HSA OAuth requires client credentials and a token or issuer URL.',
      )
    }
    const oauthCa = oauthCaPath
      ? await loadStrictCertificateAuthority({ caPath: oauthCaPath })
      : undefined
    const appTrustRoots = strictCertificateAuthorityRawValues(tls.ca)
    if (
      oauthCa &&
      strictCertificateAuthorityRawValues(oauthCa).some(oauthRoot =>
        appTrustRoots.some(appRoot => appRoot.equals(oauthRoot)),
      )
    ) {
      throw new StrictHsaPersonLookupError(
        'hsa_strict_oauth_trust_reused',
        'Strict HSA OAuth trust must be independent from App-to-Kong trust.',
      )
    }
    oauth = {
      ...(oauthAudience ? { audience: oauthAudience } : {}),
      ...(oauthCa ? { ca: oauthCa } : {}),
      clientId: oauthClientId,
      clientSecret: oauthClientSecret,
      ...(oauthIssuerUrl
        ? {
            issuerUrl: requiredHttpsUrl(
              oauthIssuerUrl,
              'hsa_strict_oauth_url_invalid',
            ),
          }
        : {}),
      ...(oauthScope ? { scope: oauthScope } : {}),
      ...(oauthTokenUrl
        ? {
            tokenUrl: requiredHttpsUrl(
              oauthTokenUrl,
              'hsa_strict_oauth_url_invalid',
            ),
          }
        : {}),
    }
  }
  return Object.freeze({
    endpointUrl: requiredHttpsUrl(endpointUrl, 'hsa_strict_url_invalid'),
    ...(oauth ? { oauth: Object.freeze(oauth) } : {}),
    timeoutMs: timeoutFromEnv(env),
    tls: Object.freeze({ ...tls, serverName }),
  })
}

let startupSnapshot: Promise<StrictHsaPersonLookupSnapshot | null> | null = null

/**
 * Return the process-wide, immutable HSA transport snapshot. Certificate
 * rotation therefore requires recreating the App instead of replacing files
 * underneath a running process.
 */
export function getStrictHsaPersonLookupSnapshot(): Promise<StrictHsaPersonLookupSnapshot | null> {
  startupSnapshot ??= loadStrictHsaPersonLookupSnapshot()
  return startupSnapshot
}

export function resetStrictHsaPersonLookupSnapshotForTests(): void {
  if (process.env.NODE_ENV !== 'test') return
  startupSnapshot = null
}

interface StrictRequest {
  body?: string
  headers: Record<string, string>
  maxResponseBytes: number
  method: 'GET' | 'POST'
  timeoutMs: number
  tls: { ca?: Buffer; cert?: Buffer; key?: Buffer; serverName?: string }
  url: string
}

interface StrictResponse {
  body: string
  contentType: string
  status: number
}

export type StrictHsaRequest = StrictRequest
export type StrictHsaResponse = StrictResponse
export type StrictHsaRequestImpl = (
  request: StrictRequest,
) => Promise<StrictResponse>

async function executeStrictRequest(
  input: StrictRequest,
): Promise<StrictResponse> {
  const endpoint = new URL(input.url)
  const serverName = input.tls.serverName
  return await new Promise((resolve, reject) => {
    let settled = false
    const finish = (action: () => void): void => {
      if (settled) return
      settled = true
      action()
    }
    const request = https.request(
      {
        ca: input.tls.ca,
        cert: input.tls.cert,
        ...(serverName
          ? {
              checkServerIdentity: (_hostname, certificate) => {
                if (certificate.subjectaltname !== `DNS:${serverName}`) {
                  return new Error('strict_server_identity_rejected')
                }
                return checkServerIdentity(serverName, certificate)
              },
            }
          : {}),
        headers: {
          ...input.headers,
          ...(input.body
            ? { 'Content-Length': Buffer.byteLength(input.body).toString() }
            : {}),
        },
        hostname: endpoint.hostname,
        key: input.tls.key,
        method: input.method,
        minVersion: 'TLSv1.2',
        path: `${endpoint.pathname}${endpoint.search}`,
        port: endpoint.port ? Number(endpoint.port) : 443,
        rejectUnauthorized: true,
        servername: serverName,
        timeout: input.timeoutMs,
      },
      response => {
        const chunks: Buffer[] = []
        let total = 0
        response.on('data', chunk => {
          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
          total += buffer.byteLength
          if (total > input.maxResponseBytes) {
            response.destroy()
            finish(() => reject(new Error('response_too_large')))
            return
          }
          chunks.push(buffer)
        })
        response.on('error', error => finish(() => reject(error)))
        response.on('end', () =>
          finish(() =>
            resolve({
              body: Buffer.concat(chunks).toString('utf8'),
              contentType: String(response.headers['content-type'] ?? ''),
              status: response.statusCode ?? 0,
            }),
          ),
        )
      },
    )
    request.on('timeout', () => request.destroy(new Error('lookup_timeout')))
    request.on('error', error => finish(() => reject(error)))
    if (input.body) request.write(input.body)
    request.end()
  })
}

function parseJson(response: StrictResponse): unknown {
  const mediaType = response.contentType.split(';', 1)[0]?.trim().toLowerCase()
  if (
    mediaType !== 'application/json' &&
    !(mediaType.startsWith('application/') && mediaType.endsWith('+json'))
  ) {
    throw new Error('invalid_media_type')
  }
  try {
    return JSON.parse(response.body)
  } catch {
    throw new Error('invalid_json')
  }
}

function textField(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

async function oauthToken(
  snapshot: StrictHsaPersonLookupSnapshot,
  request: StrictHsaRequestImpl,
): Promise<string | null> {
  if (!snapshot.oauth) return null
  let tokenUrl = snapshot.oauth.tokenUrl
  if (!tokenUrl && snapshot.oauth.issuerUrl) {
    const issuer = snapshot.oauth.issuerUrl.replace(/\/+$/u, '')
    const discovery = await request({
      headers: { Accept: 'application/json' },
      maxResponseBytes: MAX_RESPONSE_BYTES,
      method: 'GET',
      timeoutMs: snapshot.timeoutMs,
      tls: { ca: snapshot.oauth.ca },
      url: `${issuer}/.well-known/openid-configuration`,
    })
    const payload = parseJson(discovery) as Record<string, unknown>
    if (discovery.status < 200 || discovery.status >= 300)
      throw new Error('oauth')
    if (textField(payload.issuer)?.replace(/\/+$/u, '') !== issuer) {
      throw new Error('oauth_issuer')
    }
    tokenUrl = requiredHttpsUrl(
      String(payload.token_endpoint ?? ''),
      'hsa_strict_oauth_url_invalid',
    )
    if (new URL(tokenUrl).origin !== new URL(issuer).origin) {
      throw new Error('oauth_origin')
    }
  }
  if (!tokenUrl) throw new Error('oauth_token_url')
  const form = new URLSearchParams({ grant_type: 'client_credentials' })
  if (snapshot.oauth.scope) form.set('scope', snapshot.oauth.scope)
  if (snapshot.oauth.audience) form.set('audience', snapshot.oauth.audience)
  const encodeCredential = (value: string): string => {
    const encoded = new URLSearchParams({ '': value }).toString()
    return encoded.slice(1)
  }
  const encodedCredentials = `${encodeCredential(snapshot.oauth.clientId)}:${encodeCredential(snapshot.oauth.clientSecret)}`
  const response = await request({
    body: form.toString(),
    headers: {
      Accept: 'application/json',
      Authorization: `Basic ${Buffer.from(encodedCredentials).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    maxResponseBytes: MAX_RESPONSE_BYTES,
    method: 'POST',
    timeoutMs: snapshot.timeoutMs,
    tls: { ca: snapshot.oauth.ca },
    url: tokenUrl,
  })
  const payload = parseJson(response) as Record<string, unknown>
  const accessToken = textField(payload.access_token)
  if (response.status < 200 || response.status >= 300 || !accessToken) {
    throw new Error('oauth_token')
  }
  return accessToken
}

export async function lookupHsaPersonStrict(
  hsaId: string,
  {
    request = executeStrictRequest,
    snapshot,
    uuid,
  }: {
    request?: StrictHsaRequestImpl
    snapshot?: StrictHsaPersonLookupSnapshot | null
    uuid?: () => string
  } = {},
): Promise<RequirementResponsibilityPersonRecord> {
  if (!isHsaId(hsaId)) {
    throw validationError('Invalid HSA-id format', { reason: 'invalid_hsa_id' })
  }
  try {
    const resolved =
      snapshot === undefined
        ? await getStrictHsaPersonLookupSnapshot()
        : snapshot
    if (!resolved) {
      throw serviceUnavailableError('HSA lookup URL is not configured', {
        reason: 'hsa_lookup_missing_config',
      })
    }
    const correlationId = createHsaCorrelationId(uuid)
    console.info(
      JSON.stringify({
        correlation_id: correlationId,
        event: 'hsa_app_lookup_started',
      }),
    )
    const token = await oauthToken(resolved, request)
    const response = await request({
      body: JSON.stringify({ hsaId }),
      headers: {
        Accept: 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        'Content-Type': 'application/json',
        [CORRELATION_HEADER]: correlationId,
      },
      maxResponseBytes: MAX_RESPONSE_BYTES,
      method: 'POST',
      timeoutMs: resolved.timeoutMs,
      tls: resolved.tls,
      url: resolved.endpointUrl,
    })
    const payload = parseJson(response) as Record<string, unknown>
    const code = textField(payload?.code)
    if (response.status < 200 || response.status >= 300) {
      if (code === 'not_found') {
        throw validationError('HSA-id was not found in the HSA directory', {
          reason: 'hsa_lookup_not_found',
        })
      }
      if (response.status === 409 || code === 'conflict') {
        throw conflictError('HSA lookup returned conflicting person records', {
          reason: 'hsa_lookup_conflict',
        })
      }
      throw serviceUnavailableError('HSA lookup service is unavailable', {
        reason: 'hsa_lookup_unavailable',
      })
    }
    const returnedHsaId = textField(payload.hsaId)
    const givenName = textField(payload.givenName)
    if (!returnedHsaId || !givenName) throw new Error('invalid_response')
    if (returnedHsaId !== hsaId) {
      throw conflictError('HSA lookup returned a different identity', {
        reason: 'hsa_lookup_conflict',
      })
    }
    console.info(
      JSON.stringify({
        correlation_id: correlationId,
        event: 'hsa_app_lookup_completed',
      }),
    )
    return {
      email: textField(payload.email),
      givenName,
      hasProtectedPersonalData: payload.hasProtectedPersonalData === true,
      hsaId: returnedHsaId,
      middleName: textField(payload.middleName),
      surname: textField(payload.surname),
    }
  } catch (error) {
    if (isRequirementsServiceError(error)) throw error
    throw serviceUnavailableError('HSA lookup service is unavailable', {
      reason: 'hsa_lookup_unavailable',
    })
  }
}
