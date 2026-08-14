import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  AuthConfigError,
  getAuthConfig,
  getMcpAuthConfig,
  resetAuthConfigForTests,
} from '@/lib/auth/config'

const COOKIE_PASSWORD =
  'test-cookie-password-must-be-at-least-32-characters-long'

const TRACKED_ENV_KEYS = [
  'AUTH_OIDC_CLIENT_ID',
  'AUTH_OIDC_CLIENT_SECRET',
  'AUTH_OIDC_ISSUER_URL',
  'AUTH_OIDC_POST_LOGOUT_REDIRECT_URI',
  'AUTH_OIDC_REDIRECT_URI',
  'AUTH_SESSION_COOKIE_PASSWORD',
  'AUTH_SESSION_TTL_SECONDS',
  'AUTH_MCP_REQUIRED_SCOPES',
  'AUTH_MCP_ROLES_CLAIM',
  'AUTH_MCP_TOKEN_MAX_AGE_SECONDS',
  'MCP_CLIENT_ID',
] as const

const env = process.env as Record<string, string | undefined>
const originalEnv = Object.fromEntries(
  TRACKED_ENV_KEYS.map(key => [key, env[key]]),
) as Record<(typeof TRACKED_ENV_KEYS)[number], string | undefined>

function restoreTrackedEnv() {
  for (const key of TRACKED_ENV_KEYS) {
    const value = originalEnv[key]
    if (value === undefined) {
      delete env[key]
    } else {
      env[key] = value
    }
  }
}

function setBaseAuthEnv() {
  env.AUTH_OIDC_ISSUER_URL = 'https://issuer.example.com'
  env.AUTH_OIDC_CLIENT_ID = 'kravhantering-app-prod'
  env.AUTH_OIDC_CLIENT_SECRET = 'prod-secret-value'
  env.AUTH_OIDC_REDIRECT_URI = 'https://app.example.com/api/auth/callback'
  env.AUTH_OIDC_POST_LOGOUT_REDIRECT_URI = 'https://app.example.com/'
  env.AUTH_SESSION_COOKIE_PASSWORD = COOKIE_PASSWORD
}

function expectInvalidAuthUrl(
  name: 'AUTH_OIDC_POST_LOGOUT_REDIRECT_URI' | 'AUTH_OIDC_REDIRECT_URI',
  value: string,
) {
  env[name] = value
  resetAuthConfigForTests()
  try {
    getAuthConfig()
  } catch (error) {
    expect(error).toBeInstanceOf(AuthConfigError)
    expect((error as Error).message).toContain(`Invalid ${name}=`)
    expect((error as Error).message).toContain(
      'expected an absolute http:// or https:// URL',
    )
    return
  }
  throw new Error(`expected ${name}=${value} to be rejected`)
}

describe('auth config', () => {
  beforeEach(() => {
    setBaseAuthEnv()
    resetAuthConfigForTests()
  })

  afterEach(() => {
    restoreTrackedEnv()
    resetAuthConfigForTests()
  })

  it('loads a fully-populated config from env vars', () => {
    const cfg = getAuthConfig()
    expect(cfg.issuerUrl).toBe('https://issuer.example.com')
    expect(cfg.clientId).toBe('kravhantering-app-prod')
    expect(cfg.redirectUri).toBe('https://app.example.com/api/auth/callback')
    expect(cfg.postLogoutRedirectUri).toBe('https://app.example.com/')
    expect(cfg.cookiePassword.length).toBeGreaterThanOrEqual(32)
  })

  it('keeps MCP disabled when no service client is configured', () => {
    delete env.MCP_CLIENT_ID
    env.AUTH_MCP_REQUIRED_SCOPES = ''
    env.AUTH_MCP_TOKEN_MAX_AGE_SECONDS = 'invalid'
    resetAuthConfigForTests()

    expect(getMcpAuthConfig()).toBeNull()
  })

  it('loads the enabled MCP service-token contract', () => {
    env.MCP_CLIENT_ID = 'kravhantering-mcp'
    env.AUTH_MCP_REQUIRED_SCOPES = 'kravhantering:mcp requirements:read'
    env.AUTH_MCP_TOKEN_MAX_AGE_SECONDS = '420'
    env.AUTH_MCP_ROLES_CLAIM = 'mcp_roles'
    resetAuthConfigForTests()

    expect(getMcpAuthConfig()).toEqual({
      clientId: 'kravhantering-mcp',
      requiredScopes: ['kravhantering:mcp', 'requirements:read'],
      rolesClaim: 'mcp_roles',
      tokenMaxAgeSeconds: 420,
    })
  })

  it('uses the documented MCP role claim and token-age defaults', () => {
    env.MCP_CLIENT_ID = 'kravhantering-mcp'
    env.AUTH_MCP_REQUIRED_SCOPES = 'kravhantering:mcp'
    delete env.AUTH_MCP_ROLES_CLAIM
    delete env.AUTH_MCP_TOKEN_MAX_AGE_SECONDS
    resetAuthConfigForTests()

    expect(getMcpAuthConfig()).toEqual({
      clientId: 'kravhantering-mcp',
      requiredScopes: ['kravhantering:mcp'],
      rolesClaim: 'roles',
      tokenMaxAgeSeconds: 300,
    })
  })

  it.each([
    ['missing scopes', 'AUTH_MCP_REQUIRED_SCOPES', '', 'required'],
    ['non-integer age', 'AUTH_MCP_TOKEN_MAX_AGE_SECONDS', '60.5', 'integer'],
    ['too-small age', 'AUTH_MCP_TOKEN_MAX_AGE_SECONDS', '59', '60 through 900'],
    [
      'too-large age',
      'AUTH_MCP_TOKEN_MAX_AGE_SECONDS',
      '901',
      '60 through 900',
    ],
  ] as const)(
    'rejects enabled MCP configuration with %s',
    (_, key, value, message) => {
      env.MCP_CLIENT_ID = 'kravhantering-mcp'
      env.AUTH_MCP_REQUIRED_SCOPES = 'kravhantering:mcp'
      env[key] = value
      resetAuthConfigForTests()

      expect(() => getMcpAuthConfig()).toThrow(message)
    },
  )

  it('throws AuthConfigError when a required env var is missing', () => {
    delete env.AUTH_OIDC_ISSUER_URL
    resetAuthConfigForTests()
    expect(() => getAuthConfig()).toThrow(AuthConfigError)
  })

  it.each([
    'AUTH_OIDC_CLIENT_ID',
    'AUTH_OIDC_CLIENT_SECRET',
    'AUTH_OIDC_REDIRECT_URI',
    'AUTH_OIDC_POST_LOGOUT_REDIRECT_URI',
    'AUTH_SESSION_COOKIE_PASSWORD',
  ] as const)('reports missing required variable %s', name => {
    delete env[name]
    resetAuthConfigForTests()
    expect(() => getAuthConfig()).toThrow(name)
  })

  it.each(['not-a-number', '0', '-1', 'Infinity'])(
    'rejects invalid session TTL %s',
    value => {
      env.AUTH_SESSION_TTL_SECONDS = value
      resetAuthConfigForTests()
      expect(() => getAuthConfig()).toThrow('expected a positive finite number')
    },
  )

  it('throws when cookie password is shorter than 32 chars', () => {
    env.AUTH_SESSION_COOKIE_PASSWORD = 'too-short'
    resetAuthConfigForTests()
    expect(() => getAuthConfig()).toThrow(/at least 32 characters/)
  })

  it.each([
    ['relative', '/api/auth/callback'],
    ['malformed', 'https://[::1'],
    ['non-HTTP(S)', 'ftp://app.example.com/api/auth/callback'],
  ])('throws when AUTH_OIDC_REDIRECT_URI is %s', (_label, value) => {
    expectInvalidAuthUrl('AUTH_OIDC_REDIRECT_URI', value)
  })

  it.each([
    ['relative', '/'],
    ['malformed', 'https://[::1'],
    ['non-HTTP(S)', 'ftp://app.example.com/'],
  ])(
    'throws when AUTH_OIDC_POST_LOGOUT_REDIRECT_URI is %s',
    (_label, value) => {
      expectInvalidAuthUrl('AUTH_OIDC_POST_LOGOUT_REDIRECT_URI', value)
    },
  )
})
