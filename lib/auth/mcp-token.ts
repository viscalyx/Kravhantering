import { createRemoteJWKSet, jwtVerify } from 'jose'
import { recordSecurityEvent } from '@/lib/auth/audit'
import { isHsaId } from '@/lib/auth/hsa-id'
import { CANONICAL_ROLES, type CanonicalRole } from '@/lib/auth/roles'
import type { ActorContext } from '@/lib/requirements/auth'
import { ALLOW_INSECURE_OIDC_ISSUER } from '@/lib/runtime/build-target'

type VerifiedMcpToken = {
  actor: ActorContext
}

type RemoteJwks = ReturnType<typeof createRemoteJWKSet>

type JwksCacheEntry = {
  issuer: string
  jwksUri: string
  jwks: RemoteJwks
}

let jwksCache: JwksCacheEntry | null = null

export type McpAuthFailureReason =
  | 'auth_boundary_failed'
  | 'auth_configuration_invalid'
  | 'bearer_missing'
  | 'hsa_id_invalid'
  | 'hsa_id_missing'
  | 'jwks_configuration_invalid'
  | 'jwks_unavailable'
  | 'oidc_discovery_failed'
  | 'token_audience_invalid'
  | 'token_class_invalid'
  | 'token_client_invalid'
  | 'token_exp_invalid'
  | 'token_iat_invalid'
  | 'token_issuer_invalid'
  | 'token_lifetime_invalid'
  | 'token_scope_invalid'
  | 'token_subject_invalid'
  | 'token_verification_failed'

interface McpAuthFailureContract {
  message: string
  status: number
}

const MCP_AUTH_FAILURE_CONTRACTS: Record<
  McpAuthFailureReason,
  McpAuthFailureContract
> = {
  auth_boundary_failed: { message: 'Authentication failed.', status: 500 },
  auth_configuration_invalid: {
    message: 'Authentication failed.',
    status: 500,
  },
  bearer_missing: { message: 'Missing Bearer token.', status: 401 },
  hsa_id_invalid: { message: 'Invalid Bearer token.', status: 401 },
  hsa_id_missing: { message: 'Invalid Bearer token.', status: 401 },
  jwks_configuration_invalid: {
    message: 'Authentication failed.',
    status: 500,
  },
  jwks_unavailable: {
    message: 'Authentication service unavailable.',
    status: 503,
  },
  oidc_discovery_failed: {
    message: 'Authentication service unavailable.',
    status: 503,
  },
  token_audience_invalid: { message: 'Invalid Bearer token.', status: 401 },
  token_class_invalid: { message: 'Invalid Bearer token.', status: 401 },
  token_client_invalid: { message: 'Invalid Bearer token.', status: 401 },
  token_exp_invalid: { message: 'Invalid Bearer token.', status: 401 },
  token_iat_invalid: { message: 'Invalid Bearer token.', status: 401 },
  token_issuer_invalid: { message: 'Invalid Bearer token.', status: 401 },
  token_lifetime_invalid: { message: 'Invalid Bearer token.', status: 401 },
  token_scope_invalid: { message: 'Invalid Bearer token.', status: 401 },
  token_subject_invalid: { message: 'Invalid Bearer token.', status: 401 },
  token_verification_failed: { message: 'Invalid Bearer token.', status: 401 },
}

const MCP_CLOCK_TOLERANCE_SECONDS = 30

class McpAuthDependencyError extends Error {
  constructor(public readonly reason: McpAuthFailureReason) {
    super(reason)
    this.name = 'McpAuthDependencyError'
  }
}

function parseJwksUrl(jwksUri: string): URL {
  let url: URL
  try {
    url = new URL(jwksUri)
  } catch {
    throw new McpAuthDependencyError('jwks_configuration_invalid')
  }
  if (url.protocol === 'https:') return url
  if (url.protocol === 'http:' && ALLOW_INSECURE_OIDC_ISSUER) return url
  throw new McpAuthDependencyError('jwks_configuration_invalid')
}

async function getOrCreateJwks(issuer: string): Promise<RemoteJwks> {
  let metadata: { jwks_uri?: string }
  try {
    const { getOidcConfiguration } = await import('@/lib/auth/oidc')
    metadata = (await getOidcConfiguration()).serverMetadata()
  } catch {
    throw new McpAuthDependencyError('oidc_discovery_failed')
  }
  const jwksUri = metadata.jwks_uri
  if (!jwksUri) {
    throw new McpAuthDependencyError('jwks_configuration_invalid')
  }
  if (
    jwksCache &&
    jwksCache.issuer === issuer &&
    jwksCache.jwksUri === jwksUri
  ) {
    return jwksCache.jwks
  }
  let jwks: RemoteJwks
  try {
    jwks = createRemoteJWKSet(parseJwksUrl(jwksUri))
  } catch (error) {
    if (error instanceof McpAuthDependencyError) throw error
    throw new McpAuthDependencyError('jwks_configuration_invalid')
  }
  jwksCache = { issuer, jwksUri, jwks }
  return jwks
}

export function resetMcpJwksCacheForTests(): void {
  jwksCache = null
}

export class McpAuthError extends Error {
  public readonly status: number

  constructor(public readonly reason: McpAuthFailureReason) {
    const contract = MCP_AUTH_FAILURE_CONTRACTS[reason]
    super(contract.message)
    this.name = 'McpAuthError'
    this.status = contract.status
  }
}

function rejectMcpAuthentication(
  request: Request,
  reason: McpAuthFailureReason,
): never {
  recordSecurityEvent({
    event: 'auth.token.rejected',
    outcome: 'failure',
    actor: { source: 'mcp' },
    request,
    detail: { reason },
  })
  throw new McpAuthError(reason)
}

function errorProperty(error: unknown, key: string): unknown {
  return error && typeof error === 'object'
    ? (error as Record<string, unknown>)[key]
    : undefined
}

function classifyVerificationFailure(error: unknown): McpAuthFailureReason {
  if (error instanceof McpAuthDependencyError) return error.reason

  const code = errorProperty(error, 'code')
  const claim = errorProperty(error, 'claim')
  if (code === 'ERR_JWT_CLAIM_VALIDATION_FAILED' && claim === 'iss') {
    return 'token_issuer_invalid'
  }
  if (code === 'ERR_JWT_CLAIM_VALIDATION_FAILED' && claim === 'aud') {
    return 'token_audience_invalid'
  }
  if (code === 'ERR_JWKS_TIMEOUT') {
    return 'jwks_unavailable'
  }
  return 'token_verification_failed'
}

function parseMcpRolesClaim(claim: unknown): CanonicalRole[] {
  if (claim === undefined || (Array.isArray(claim) && claim.length === 0)) {
    return []
  }
  if (!Array.isArray(claim)) return []

  const roles: CanonicalRole[] = []
  for (const entry of claim) {
    if (
      typeof entry !== 'string' ||
      !(CANONICAL_ROLES as readonly string[]).includes(entry) ||
      roles.includes(entry as CanonicalRole)
    ) {
      return []
    }
    roles.push(entry as CanonicalRole)
  }
  return roles
}

/**
 * Verifies a Bearer JWT on an incoming MCP request.
 *
 * Throws `McpAuthError` when a token is missing or invalid.
 */
export async function verifyMcpBearerToken(
  request: Request,
): Promise<VerifiedMcpToken> {
  const header = request.headers.get('authorization') ?? ''
  const match = /^Bearer\s+(\S+)$/i.exec(header)
  if (!match) {
    rejectMcpAuthentication(request, 'bearer_missing')
  }
  const token = match[1]

  try {
    const { getAuthConfig, getMcpAuthConfig } = await import(
      '@/lib/auth/config'
    )
    let cfg: ReturnType<typeof getAuthConfig>
    let mcpCfg: NonNullable<ReturnType<typeof getMcpAuthConfig>>
    try {
      cfg = getAuthConfig()
      const configuredMcp = getMcpAuthConfig()
      if (configuredMcp === null) {
        throw new Error('MCP authentication is disabled')
      }
      mcpCfg = configuredMcp
    } catch {
      rejectMcpAuthentication(request, 'auth_configuration_invalid')
    }
    const issuer = cfg.issuerUrl
    const audience = cfg.apiAudience
    const jwks = await getOrCreateJwks(issuer)
    let verificationResult: Awaited<ReturnType<typeof jwtVerify>>
    try {
      verificationResult = await jwtVerify(token, jwks, {
        issuer,
        audience,
        clockTolerance: MCP_CLOCK_TOLERANCE_SECONDS,
      })
    } catch (error) {
      if (error instanceof TypeError) {
        throw new McpAuthDependencyError('jwks_unavailable')
      }
      throw error
    }
    const { payload, protectedHeader } = verificationResult
    if (protectedHeader.typ !== 'at+jwt') {
      rejectMcpAuthentication(request, 'token_class_invalid')
    }
    if (typeof payload.exp !== 'number' || !Number.isFinite(payload.exp)) {
      rejectMcpAuthentication(request, 'token_exp_invalid')
    }
    if (typeof payload.sub !== 'string' || payload.sub.trim() === '') {
      rejectMcpAuthentication(request, 'token_subject_invalid')
    }
    const sub = payload.sub
    if (typeof payload.iat !== 'number' || !Number.isFinite(payload.iat)) {
      rejectMcpAuthentication(request, 'token_iat_invalid')
    }
    const nowSeconds = Date.now() / 1000
    if (payload.iat > nowSeconds + MCP_CLOCK_TOLERANCE_SECONDS) {
      rejectMcpAuthentication(request, 'token_iat_invalid')
    }
    if (
      nowSeconds - payload.iat >
        mcpCfg.tokenMaxAgeSeconds + MCP_CLOCK_TOLERANCE_SECONDS ||
      payload.exp <= payload.iat ||
      payload.exp - payload.iat > mcpCfg.tokenMaxAgeSeconds
    ) {
      rejectMcpAuthentication(request, 'token_lifetime_invalid')
    }
    const payloadRecord = payload as Record<string, unknown>
    const clientId = payloadRecord.client_id
    const authorizedParty = payloadRecord.azp
    if (
      clientId !== mcpCfg.clientId ||
      (authorizedParty !== undefined && authorizedParty !== mcpCfg.clientId)
    ) {
      rejectMcpAuthentication(request, 'token_client_invalid')
    }
    const scopeRaw = payloadRecord.scope
    if (typeof scopeRaw !== 'string') {
      rejectMcpAuthentication(request, 'token_scope_invalid')
    }
    const scopes = scopeRaw.split(/\s+/).filter(Boolean)
    const scopeSet = new Set(scopes)
    if (!mcpCfg.requiredScopes.every(scope => scopeSet.has(scope))) {
      rejectMcpAuthentication(request, 'token_scope_invalid')
    }
    const roles = parseMcpRolesClaim(payloadRecord[mcpCfg.rolesClaim])
    const hsaIdClaim = payloadRecord.employeeHsaId
    const hsaIdRaw =
      typeof hsaIdClaim === 'string' && hsaIdClaim !== '' ? hsaIdClaim : null
    if (!hsaIdRaw) {
      rejectMcpAuthentication(request, 'hsa_id_missing')
    }
    if (!isHsaId(hsaIdRaw)) {
      rejectMcpAuthentication(request, 'hsa_id_invalid')
    }
    recordSecurityEvent({
      event: 'auth.mcp.token.accepted',
      outcome: 'success',
      actor: {
        source: 'mcp',
        sub,
        hsaId: hsaIdRaw,
        clientId: mcpCfg.clientId,
      },
      request,
      detail: { roles, scopes },
    })
    return {
      actor: {
        id: sub,
        displayName: sub,
        hsaId: hsaIdRaw,
        roles,
        source: 'mcp',
        isAuthenticated: true,
      },
    }
  } catch (err) {
    if (err instanceof McpAuthError) throw err
    rejectMcpAuthentication(request, classifyVerificationFailure(err))
  }
}
