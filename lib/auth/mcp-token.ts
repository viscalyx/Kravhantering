import { createRemoteJWKSet, jwtVerify } from 'jose'
import { recordSecurityEvent } from '@/lib/auth/audit'
import { isHsaId } from '@/lib/auth/hsa-id'
import { parseRolesClaim } from '@/lib/auth/roles'
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
  | 'token_issuer_invalid'
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
  token_issuer_invalid: { message: 'Invalid Bearer token.', status: 401 },
  token_verification_failed: { message: 'Invalid Bearer token.', status: 401 },
}

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
    const { getAuthConfig } = await import('@/lib/auth/config')
    let cfg: ReturnType<typeof getAuthConfig>
    try {
      cfg = getAuthConfig()
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
        clockTolerance: 30,
      })
    } catch (error) {
      if (error instanceof TypeError) {
        throw new McpAuthDependencyError('jwks_unavailable')
      }
      throw error
    }
    const { payload } = verificationResult
    const sub = typeof payload.sub === 'string' ? payload.sub : null
    const roles = parseRolesClaim(payload.roles)
    const payloadRecord = payload as Record<string, unknown>
    const clientId =
      typeof payloadRecord.client_id === 'string'
        ? payloadRecord.client_id
        : typeof payloadRecord.azp === 'string'
          ? payloadRecord.azp
          : undefined
    const hsaIdClaim = payloadRecord.employeeHsaId
    const hsaIdRaw =
      typeof hsaIdClaim === 'string' && hsaIdClaim !== '' ? hsaIdClaim : null
    if (!hsaIdRaw) {
      rejectMcpAuthentication(request, 'hsa_id_missing')
    }
    if (!isHsaId(hsaIdRaw)) {
      rejectMcpAuthentication(request, 'hsa_id_invalid')
    }
    const scopeRaw = payloadRecord.scope
    const scopes =
      typeof scopeRaw === 'string' ? scopeRaw.split(/\s+/).filter(Boolean) : []
    recordSecurityEvent({
      event: 'auth.mcp.token.accepted',
      outcome: 'success',
      actor: {
        source: 'mcp',
        sub: sub ?? undefined,
        hsaId: hsaIdRaw,
        clientId,
      },
      request,
      detail: { roles, scopes },
    })
    return {
      actor: {
        id: sub,
        displayName: sub ?? '',
        hsaId: hsaIdRaw,
        roles,
        source: 'mcp',
        isAuthenticated: Boolean(sub),
      },
    }
  } catch (err) {
    if (err instanceof McpAuthError) throw err
    rejectMcpAuthentication(request, classifyVerificationFailure(err))
  }
}
