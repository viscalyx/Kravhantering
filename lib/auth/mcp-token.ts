import { createRemoteJWKSet, jwtVerify } from 'jose'
import { recordSecurityEvent } from '@/lib/auth/audit'
import { isHsaId } from '@/lib/auth/hsa-id'
import { parseRolesClaim } from '@/lib/auth/roles'
import type { ActorContext } from '@/lib/requirements/auth'

type VerifiedMcpToken = {
  actor: ActorContext
}

type JwksCacheEntry = {
  issuer: string
  jwks: ReturnType<typeof createRemoteJWKSet>
}

let jwksCache: JwksCacheEntry | null = null

function getOrCreateJwks(issuer: string) {
  if (jwksCache && jwksCache.issuer === issuer) return jwksCache.jwks
  const jwks = createRemoteJWKSet(
    new URL(`${issuer.replace(/\/$/, '')}/.well-known/jwks.json`),
  )
  jwksCache = { issuer, jwks }
  return jwks
}

export function resetMcpJwksCacheForTests() {
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
 * Returns `null` when authentication is disabled (opt-out dev mode) so the
 * caller can continue with legacy header-trust behaviour. Throws
 * `McpAuthError` when a token is missing or invalid.
 */
export async function verifyMcpBearerToken(
  request: Request,
): Promise<VerifiedMcpToken | null> {
  const { getAuthConfig } = await import('@/lib/auth/config')
  const cfg = getAuthConfig()
  if (!cfg.enabled) return null

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
  const jwks = getOrCreateJwks(issuer)

  try {
    const { payload } = await jwtVerify(token, jwks, {
      issuer,
      audience,
      clockTolerance: 30,
    })
    const sub = typeof payload.sub === 'string' ? payload.sub : null
    const roles = parseRolesClaim(payload.roles)
    const clientId =
      typeof (payload as Record<string, unknown>).client_id === 'string'
        ? ((payload as Record<string, unknown>).client_id as string)
        : undefined
    const hsaIdRaw = (payload as Record<string, unknown>).employeeHsaId
    if (typeof hsaIdRaw !== 'string' || hsaIdRaw === '') {
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
