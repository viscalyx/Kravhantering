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
 * Env vars (defaults match the committed dev Keycloak realm):
 *   AUTH_OIDC_ISSUER_URL  http://localhost:8080/realms/kravhantering-dev
 *   MCP_CLIENT_ID         kravhantering-mcp
 *   MCP_CLIENT_SECRET     dev-only-mcp-secret
 *
 * Output (stdout, single line):
 *   <access token>
 */

import { resolve } from 'node:path'
import { argv, env, exit, stderr, stdout } from 'node:process'
import { fileURLToPath } from 'node:url'

const DEFAULT_ISSUER_URL = 'http://localhost:8080/realms/kravhantering-dev'
const DEFAULT_CLIENT_ID = 'kravhantering-mcp'
const DEFAULT_CLIENT_SECRET = 'dev-only-mcp-secret'

function fail(message) {
  stderr.write(`[get-mcp-token] ${message}\n`)
  exit(1)
}

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
  clientId = DEFAULT_CLIENT_ID,
  clientSecret = DEFAULT_CLIENT_SECRET,
} = {}) {
  const body = new URLSearchParams()
  body.set('grant_type', 'client_credentials')
  body.set('client_id', requireNonEmpty('MCP_CLIENT_ID', clientId))
  body.set('client_secret', requireNonEmpty('MCP_CLIENT_SECRET', clientSecret))
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

export async function fetchMcpToken({
  clientId = DEFAULT_CLIENT_ID,
  clientSecret = DEFAULT_CLIENT_SECRET,
  fetchImpl = globalThis.fetch,
  issuerUrl = DEFAULT_ISSUER_URL,
  timeoutMs = 5000,
} = {}) {
  if (typeof fetchImpl !== 'function') {
    throw new Error('fetch is not available in this Node.js runtime')
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  let response
  try {
    response = await fetchImpl(buildTokenEndpoint(issuerUrl), {
      body: createClientCredentialsBody({ clientId, clientSecret }),
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

  return parseAccessTokenPayload(payload)
}

async function main() {
  const token = await fetchMcpToken({
    clientId: env.MCP_CLIENT_ID,
    clientSecret: env.MCP_CLIENT_SECRET,
    issuerUrl: env.AUTH_OIDC_ISSUER_URL,
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
