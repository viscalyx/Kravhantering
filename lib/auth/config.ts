/**
 * Centralized auth configuration. Reads env vars, validates them, and exposes
 * a typed `authConfig`.
 *
 * Authentication is mandatory in every build target.
 * Boot fails closed when required OIDC env vars are missing.
 *
 * See `docs/auth-how-it-works.md` and `docs/auth-developer-workflow.md`
 * for the committed env-var contract and deployment expectations.
 */

const FLAG_TRUE_VALUES = new Set(['1', 'true', 'yes', 'on'])
const FLAG_FALSE_VALUES = new Set(['0', 'false', 'no', 'off'])

function parseBooleanFlag(
  value: string | undefined,
  defaultValue: boolean,
): boolean {
  if (value === undefined || value === '') {
    return defaultValue
  }
  const normalized = value.trim().toLowerCase()
  if (FLAG_TRUE_VALUES.has(normalized)) {
    return true
  }
  if (FLAG_FALSE_VALUES.has(normalized)) {
    return false
  }
  return defaultValue
}

function readString(name: string): string | undefined {
  const raw = process.env[name]
  if (raw === undefined) {
    return undefined
  }
  const trimmed = raw.trim()
  return trimmed === '' ? undefined : trimmed
}

function readNumber(name: string, defaultValue: number): number {
  const raw = readString(name)
  if (raw === undefined) {
    return defaultValue
  }
  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(
      `Invalid ${name}=${raw} — expected a positive finite number`,
    )
  }
  return parsed
}

export interface AuthConfig {
  /** Audience expected on access tokens (defaults to clientId). */
  apiAudience: string
  /** Client id at the IdP. */
  clientId: string
  /** Client secret at the IdP. */
  clientSecret: string
  /** Iron-session cookie name. */
  cookieName: string
  /** Iron-session encryption password (≥32 characters, not bytes). */
  cookiePassword: string
  /** OIDC discovery base URL (issuer). */
  issuerUrl: string
  /** Absolute URL the IdP redirects back to after end-session. */
  postLogoutRedirectUri: string
  /** Absolute URL the IdP redirects back to. */
  redirectUri: string
  /** Name of the claim that carries the role list. */
  rolesClaim: string
  /** OAuth scopes requested at the authorization endpoint. */
  scopes: string
  /** Session TTL in seconds. */
  sessionTtlSeconds: number
  /** Honor X-Forwarded-Proto / X-Forwarded-Host (true behind a proxy). */
  trustProxy: boolean
}

export class AuthConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AuthConfigError'
  }
}

let cached: AuthConfig | undefined

function loadAuthConfig(): AuthConfig {
  const issuerUrl = readString('AUTH_OIDC_ISSUER_URL')
  const clientId = readString('AUTH_OIDC_CLIENT_ID')
  const clientSecret = readString('AUTH_OIDC_CLIENT_SECRET')
  const redirectUri = readString('AUTH_OIDC_REDIRECT_URI')
  const postLogoutRedirectUri = readString('AUTH_OIDC_POST_LOGOUT_REDIRECT_URI')
  const cookiePassword = readString('AUTH_SESSION_COOKIE_PASSWORD')

  const missing: string[] = []
  if (!issuerUrl) missing.push('AUTH_OIDC_ISSUER_URL')
  if (!clientId) missing.push('AUTH_OIDC_CLIENT_ID')
  if (!clientSecret) missing.push('AUTH_OIDC_CLIENT_SECRET')
  if (!redirectUri) missing.push('AUTH_OIDC_REDIRECT_URI')
  if (!postLogoutRedirectUri) missing.push('AUTH_OIDC_POST_LOGOUT_REDIRECT_URI')
  if (!cookiePassword) missing.push('AUTH_SESSION_COOKIE_PASSWORD')

  if (missing.length > 0) {
    throw new AuthConfigError(
      `Missing required auth env vars: ${missing.join(', ')}`,
    )
  }

  if (cookiePassword !== undefined && cookiePassword.length < 32) {
    throw new AuthConfigError(
      'AUTH_SESSION_COOKIE_PASSWORD must be at least 32 characters.',
    )
  }

  return {
    issuerUrl: issuerUrl as string,
    clientId: clientId as string,
    clientSecret: clientSecret as string,
    redirectUri: redirectUri as string,
    postLogoutRedirectUri: postLogoutRedirectUri as string,
    scopes: readString('AUTH_OIDC_SCOPES') ?? 'openid profile email',
    rolesClaim: readString('AUTH_OIDC_ROLES_CLAIM') ?? 'roles',
    apiAudience: readString('AUTH_OIDC_API_AUDIENCE') ?? (clientId as string),
    cookieName:
      readString('AUTH_SESSION_COOKIE_NAME') ?? 'kravhantering_session',
    cookiePassword: cookiePassword as string,
    sessionTtlSeconds: readNumber('AUTH_SESSION_TTL_SECONDS', 28_800),
    trustProxy: parseBooleanFlag(process.env.AUTH_TRUST_PROXY, true),
  }
}

export function getAuthConfig(): AuthConfig {
  if (cached === undefined) {
    cached = loadAuthConfig()
  }
  return cached
}

/** For tests only: clears the cached config so env-var changes take effect. */
export function resetAuthConfigForTests(): void {
  cached = undefined
}
