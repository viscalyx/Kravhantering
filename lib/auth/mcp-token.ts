import { createRemoteJWKSet, jwtVerify } from 'jose'
import { recordSecurityEvent } from '@/lib/auth/audit'
import { isHsaId } from '@/lib/auth/hsa-id'
import { parseRolesClaim } from '@/lib/auth/roles'
import type { ActorContext } from '@/lib/requirements/auth'

type VerifiedMcpToken = {
  actor: ActorContext
}

type RemoteJwks = ReturnType<typeof createRemoteJWKSet>

type JwksCacheEntry = {
  issuer: string
  jwksUri: string
  jwks: RemoteJwks
}

const DEFAULT_MCP_CLIENT_ID = 'kravhantering-mcp'

let jwksCache: JwksCacheEntry | null = null

function getExpectedMcpClientId(): string {
  return (
    process.env.AUTH_OIDC_MCP_CLIENT_ID?.trim() ||
    process.env.MCP_CLIENT_ID?.trim() ||
    DEFAULT_MCP_CLIENT_ID
  )
}

function syntheticMcpHsaId(clientId: string | undefined): string | null {
  if (!clientId || clientId !== getExpectedMcpClientId()) return null
  return `mcp-client:${clientId}`
}

async function getOrCreateJwks(issuer: string): Promise<RemoteJwks> {
  const { getOidcConfiguration } = await import('@/lib/auth/oidc')
  const metadata = (await getOidcConfiguration()).serverMetadata()
  const jwksUri = metadata.jwks_uri
  if (!jwksUri) {
    throw new Error('OIDC discovery metadata did not include `jwks_uri`.')
  }
  if (
    jwksCache &&
    jwksCache.issuer === issuer &&
    jwksCache.jwksUri === jwksUri
  ) {
    return jwksCache.jwks
  }
  const jwks = createRemoteJWKSet(new URL(jwksUri))
  jwksCache = { issuer, jwksUri, jwks }
  return jwks
}

export function resetMcpJwksCacheForTests(): void {
  jwksCache = null
}

export class McpAuthError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message)
    this.name = 'McpAuthError'
  }
}

/**
 * Verifies a Bearer JWT on an incoming MCP request.
 *
 * Throws `McpAuthError` when a token is missing or invalid.
 */
export async function verifyMcpBearerToken(
  request: Request,
): Promise<VerifiedMcpToken> {
  const { getAuthConfig } = await import('@/lib/auth/config')
  const cfg = getAuthConfig()

  const header = request.headers.get('authorization') ?? ''
  const match = /^Bearer\s+(\S+)$/i.exec(header)
  if (!match) {
    recordSecurityEvent({
      event: 'auth.token.rejected',
      outcome: 'failure',
      actor: { source: 'mcp' },
      request,
      detail: { reason: 'bearer_missing' },
    })
    throw new McpAuthError('Missing Bearer token.', 401)
  }
  const token = match[1]

  const issuer = cfg.issuerUrl
  const audience = cfg.apiAudience

  try {
    const jwks = await getOrCreateJwks(issuer)
    const { payload } = await jwtVerify(token, jwks, {
      issuer,
      audience,
      clockTolerance: 30,
    })
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
      typeof hsaIdClaim === 'string' && hsaIdClaim !== ''
        ? hsaIdClaim
        : syntheticMcpHsaId(clientId)
    if (!hsaIdRaw) {
      recordSecurityEvent({
        event: 'auth.token.rejected',
        outcome: 'failure',
        actor: clientId ? { source: 'mcp', clientId } : { source: 'mcp' },
        request,
        detail: { reason: 'hsa_id_missing' },
      })
      throw new McpAuthError(
        'Invalid Bearer token: missing required `employeeHsaId` claim.',
        401,
      )
    }
    // Synthetic MCP service-account namespace bypasses the HSA-id format
    // validator; everything else must be a real HSA-id.
    if (!hsaIdRaw.startsWith('mcp-client:') && !isHsaId(hsaIdRaw)) {
      recordSecurityEvent({
        event: 'auth.token.rejected',
        outcome: 'failure',
        actor: clientId ? { source: 'mcp', clientId } : { source: 'mcp' },
        request,
        detail: { reason: 'hsa_id_invalid' },
      })
      throw new McpAuthError(
        'Invalid Bearer token: `employeeHsaId` is not a valid HSA-id.',
        401,
      )
    }
    const scopeRaw = (payload as Record<string, unknown>).scope
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
    const message = err instanceof Error ? err.message : 'Invalid token.'
    recordSecurityEvent({
      event: 'auth.token.rejected',
      outcome: 'failure',
      actor: { source: 'mcp' },
      request,
      detail: {
        reason: 'jwt_verify_failed',
        errorName: err instanceof Error ? err.name : 'Error',
      },
    })
    throw new McpAuthError(`Invalid Bearer token: ${message}`, 401)
  }
}
