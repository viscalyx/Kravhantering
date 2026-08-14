#!/usr/bin/env node
/**
 * Fetches a dev-only Keycloak service-account token for the local MCP server.
 *
 * Usage:
 *   node scripts/security/get-mcp-token.mjs
 *
 * Required local services:
 *   npm run idp:up
 *
 * Env vars (defaults match the committed dev Keycloak realm where noted):
 *   AUTH_OIDC_ISSUER_URL  http://localhost:8080/realms/kravhantering-dev
 *   MCP_CLIENT_ID         required
 *   MCP_CLIENT_SECRET     dev-only-mcp-secret
 *   AUTH_MCP_REQUIRED_SCOPES required
 *
 * Output (stdout, single line):
 *   <access token>
 */

import { resolve } from 'node:path'
import { argv, env, exit, stderr, stdout } from 'node:process'
import { fileURLToPath } from 'node:url'

const DEFAULT_ISSUER_URL = 'http://localhost:8080/realms/kravhantering-dev'
const DEFAULT_API_AUDIENCE = 'kravhantering-app'
const DEFAULT_CLIENT_SECRET = 'dev-only-mcp-secret'
const HSA_ID_PATTERN = /^[A-Z]{2}\d{10}-[A-Za-z0-9]{1,18}$/
const CANONICAL_ROLES = new Set(['Reviewer', 'Admin', 'PrivacyOfficer'])

/* v8 ignore start -- Direct CLI output and process termination. */
function fail(message) {
  stderr.write(`[get-mcp-token] ${message}\n`)
  exit(1)
}
/* v8 ignore stop */

function requireNonEmpty(name, value) {
  const normalized = value?.trim()
  if (!normalized) {
    throw new Error(`${name} is required`)
  }
  return normalized
}

export function normalizeIssuerUrl(value = DEFAULT_ISSUER_URL) {
  const normalized = requireNonEmpty('AUTH_OIDC_ISSUER_URL', value)
  try {
    const url = new URL(normalized)
    return url.toString().replace(/\/+$/, '')
  } catch {
    throw new Error('AUTH_OIDC_ISSUER_URL must be a valid URL')
  }
}

export function buildTokenEndpoint(issuerUrl = DEFAULT_ISSUER_URL) {
  return `${normalizeIssuerUrl(issuerUrl)}/protocol/openid-connect/token`
}

export function createClientCredentialsBody({
  clientId,
  clientSecret = DEFAULT_CLIENT_SECRET,
  requiredScopes,
} = {}) {
  const body = new URLSearchParams()
  body.set('grant_type', 'client_credentials')
  body.set('client_id', requireNonEmpty('MCP_CLIENT_ID', clientId))
  body.set('client_secret', requireNonEmpty('MCP_CLIENT_SECRET', clientSecret))
  body.set('scope', requireNonEmpty('AUTH_MCP_REQUIRED_SCOPES', requiredScopes))
  return body
}

export function parseAccessTokenPayload(payload) {
  if (
    typeof payload !== 'object' ||
    payload === null ||
    Array.isArray(payload)
  ) {
    throw new Error('Token endpoint did not return a JSON object')
  }

  const accessToken = payload.access_token
  if (typeof accessToken !== 'string' || accessToken.trim() === '') {
    throw new Error('Token endpoint response did not include access_token')
  }

  return accessToken.trim()
}

function accessTokenContractError() {
  return new Error('Returned JWT violates the MCP access-token contract')
}

function decodeJwtJson(segment) {
  try {
    const decoded = JSON.parse(Buffer.from(segment, 'base64url').toString())
    if (
      typeof decoded !== 'object' ||
      decoded === null ||
      Array.isArray(decoded)
    ) {
      throw accessTokenContractError()
    }
    return decoded
  } catch {
    throw accessTokenContractError()
  }
}

export function validateMcpTokenShape(
  token,
  {
    apiAudience = DEFAULT_API_AUDIENCE,
    clientId,
    requiredScopes,
    rolesClaim = 'roles',
    tokenMaxAgeSeconds = 300,
  } = {},
) {
  const normalizedClientId = requireNonEmpty('MCP_CLIENT_ID', clientId)
  const normalizedScopes = requireNonEmpty(
    'AUTH_MCP_REQUIRED_SCOPES',
    requiredScopes,
  ).split(/\s+/)
  if (
    !Number.isInteger(tokenMaxAgeSeconds) ||
    tokenMaxAgeSeconds < 60 ||
    tokenMaxAgeSeconds > 900
  ) {
    throw new Error(
      'AUTH_MCP_TOKEN_MAX_AGE_SECONDS must be an integer from 60 through 900',
    )
  }
  const segments = token.split('.')
  if (segments.length !== 3) throw accessTokenContractError()

  const header = decodeJwtJson(segments[0])
  const payload = decodeJwtJson(segments[1])
  const scopes =
    typeof payload.scope === 'string'
      ? new Set(payload.scope.split(/\s+/).filter(Boolean))
      : null
  const roles = payload[rolesClaim]
  const rolesAreValid =
    Array.isArray(roles) &&
    roles.every(
      role => typeof role === 'string' && CANONICAL_ROLES.has(role),
    ) &&
    new Set(roles).size === roles.length
  const audienceMatches =
    payload.aud === apiAudience ||
    (Array.isArray(payload.aud) && payload.aud.includes(apiAudience))

  if (
    header.typ !== 'at+jwt' ||
    payload.client_id !== normalizedClientId ||
    (payload.azp !== undefined && payload.azp !== normalizedClientId) ||
    typeof payload.sub !== 'string' ||
    payload.sub.trim() === '' ||
    typeof payload.exp !== 'number' ||
    !Number.isFinite(payload.exp) ||
    typeof payload.iat !== 'number' ||
    !Number.isFinite(payload.iat) ||
    payload.exp <= payload.iat ||
    payload.exp <= Date.now() / 1000 - 30 ||
    payload.exp - payload.iat > tokenMaxAgeSeconds ||
    payload.iat > Date.now() / 1000 + 30 ||
    Date.now() / 1000 - payload.iat > tokenMaxAgeSeconds + 30 ||
    typeof payload.employeeHsaId !== 'string' ||
    !HSA_ID_PATTERN.test(payload.employeeHsaId) ||
    scopes === null ||
    !normalizedScopes.every(scope => scopes.has(scope)) ||
    !rolesAreValid ||
    !audienceMatches
  ) {
    throw accessTokenContractError()
  }

  return token
}

export async function fetchMcpToken({
  apiAudience = DEFAULT_API_AUDIENCE,
  clientId,
  clientSecret = DEFAULT_CLIENT_SECRET,
  fetchImpl = globalThis.fetch,
  issuerUrl = DEFAULT_ISSUER_URL,
  requiredScopes,
  rolesClaim = 'roles',
  timeoutMs = 5000,
  tokenMaxAgeSeconds = 300,
} = {}) {
  if (typeof fetchImpl !== 'function') {
    throw new Error('fetch is not available in this Node.js runtime')
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  let response
  try {
    response = await fetchImpl(buildTokenEndpoint(issuerUrl), {
      body: createClientCredentialsBody({
        clientId,
        clientSecret,
        requiredScopes,
      }),
      headers: {
        accept: 'application/json',
        'content-type': 'application/x-www-form-urlencoded',
      },
      method: 'POST',
      signal: controller.signal,
    })
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(`Token endpoint request timed out after ${timeoutMs} ms`)
    }
    throw err
  } finally {
    clearTimeout(timeout)
  }

  if (!response.ok) {
    throw new Error(`Token endpoint returned HTTP ${response.status}`)
  }

  const payload = await response.json().catch(() => {
    throw new Error('Token endpoint did not return valid JSON')
  })

  const token = parseAccessTokenPayload(payload)
  return validateMcpTokenShape(token, {
    apiAudience,
    clientId,
    requiredScopes,
    rolesClaim,
    tokenMaxAgeSeconds,
  })
}

/* v8 ignore start -- Direct CLI dispatch delegates to the covered helpers. */
async function main() {
  const token = await fetchMcpToken({
    apiAudience: env.AUTH_OIDC_API_AUDIENCE,
    clientId: env.MCP_CLIENT_ID,
    clientSecret: env.MCP_CLIENT_SECRET,
    issuerUrl: env.AUTH_OIDC_ISSUER_URL,
    requiredScopes: env.AUTH_MCP_REQUIRED_SCOPES,
    rolesClaim: env.AUTH_MCP_ROLES_CLAIM,
    tokenMaxAgeSeconds: Number(env.AUTH_MCP_TOKEN_MAX_AGE_SECONDS ?? '300'),
  })
  stdout.write(`${token}\n`)
}

const isMainEntry =
  argv[1] != null && resolve(argv[1]) === fileURLToPath(import.meta.url)

if (isMainEntry) {
  main().catch(err => {
    fail(err instanceof Error ? err.message : String(err))
  })
}
/* v8 ignore stop */
