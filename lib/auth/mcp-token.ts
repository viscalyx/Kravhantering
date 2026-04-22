import { createRemoteJWKSet, jwtVerify } from 'jose'
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
    })
    const sub = typeof payload.sub === 'string' ? payload.sub : null
    const roles = parseRolesClaim(payload.roles)
    return {
      actor: {
        id: sub,
        roles,
        source: 'mcp',
        isAuthenticated: Boolean(sub),
      },
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid token.'
    throw new McpAuthError(`Invalid Bearer token: ${message}`, 401)
  }
}
