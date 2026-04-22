/**
 * In-process OIDC provider for unit + integration tests.
 *
 * Spins up `oidc-provider` (panva) on a random port per Vitest worker /
 * Playwright run, registers a single client matching `AUTH_OIDC_CLIENT_ID`,
 * and exposes a `loginAs(role)` helper that produces a session cookie the
 * app can consume. No Docker, no port management, fully isolated per test
 * process.
 *
 * The same `openid-client` code path used in production runs against this
 * mock, so behavior matches Keycloak / PhenixID.
 */

import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'

// Lazy import to avoid loading `oidc-provider` (and its many transitive deps)
// in unit tests that don't need it.
// The `oidc-provider` module ships CJS with no types; we treat it as unknown
// and cast at the call site.
type OidcProviderType = new (
  issuer: string,
  options: Record<string, unknown>,
) => {
  callback(): (req: unknown, res: unknown) => void
  interactionResult: (...args: unknown[]) => Promise<unknown>
  [key: string]: unknown
}

export interface MockUser {
  email: string
  family_name: string
  given_name: string
  name: string
  preferred_username?: string
  roles: string[]
  sub: string
}

export interface MockIdpHandle {
  /** Client id registered with the mock. */
  clientId: string
  /** Client secret registered with the mock. */
  clientSecret: string
  /** Stop the HTTP server. */
  close(): Promise<void>
  /** Base URL of the issuer (e.g. http://127.0.0.1:38113). */
  issuer: string
  /** Pre-select the user the next interaction will log in as. */
  loginAs(usernameOrRole: string): void
  /** Add or replace a user account that the mock will impersonate on login. */
  setUser(user: MockUser): void
}

const DEFAULT_USERS: Record<string, MockUser> = {
  Author: {
    sub: 'mock-author-sub',
    given_name: 'Alice',
    family_name: 'Author',
    name: 'Alice Author',
    email: 'alice.author@example.test',
    preferred_username: 'alice.author',
    roles: ['Author'],
  },
  Reviewer: {
    sub: 'mock-reviewer-sub',
    given_name: 'Rita',
    family_name: 'Reviewer',
    name: 'Rita Reviewer',
    email: 'rita.reviewer@example.test',
    preferred_username: 'rita.reviewer',
    roles: ['Reviewer'],
  },
  Steward: {
    sub: 'mock-steward-sub',
    given_name: 'Steve',
    family_name: 'Steward',
    name: 'Steve Steward',
    email: 'steve.steward@example.test',
    preferred_username: 'steve.steward',
    roles: ['Steward'],
  },
  Admin: {
    sub: 'mock-admin-sub',
    given_name: 'Ada',
    family_name: 'Admin',
    name: 'Ada Admin',
    email: 'ada.admin@example.test',
    preferred_username: 'ada.admin',
    roles: ['Admin', 'Steward', 'Reviewer', 'Author'],
  },
  NoRoles: {
    sub: 'mock-noroles-sub',
    given_name: 'Noah',
    family_name: 'NoRoles',
    name: 'Noah NoRoles',
    email: 'noah.noroles@example.test',
    preferred_username: 'noah.noroles',
    roles: [],
  },
}

export interface StartMockIdpOptions {
  clientId?: string
  clientSecret?: string
  postLogoutRedirectUris?: string[]
  redirectUris?: string[]
}

export async function startMockIdp(
  options: StartMockIdpOptions = {},
): Promise<MockIdpHandle> {
  const { default: Provider } = (await import('oidc-provider')) as {
    default: OidcProviderType
  }

  const clientId = options.clientId ?? 'kravhantering-app-test'
  const clientSecret = options.clientSecret ?? 'test-secret'
  const redirectUris = options.redirectUris ?? [
    'http://localhost:3000/api/auth/callback',
  ]
  const postLogoutRedirectUris = options.postLogoutRedirectUris ?? [
    'http://localhost:3000/',
  ]

  // Bind to an ephemeral port first so we know the issuer URL up-front.
  const portProbe = createServer()
  await new Promise<void>(resolve => {
    portProbe.listen(0, '127.0.0.1', () => resolve())
  })
  const { port } = portProbe.address() as AddressInfo
  await new Promise<void>(resolve => portProbe.close(() => resolve()))

  const issuer = `http://127.0.0.1:${port}`

  const users: Record<string, MockUser> = { ...DEFAULT_USERS }
  let nextLogin: MockUser = users.Admin

  const provider = new Provider(issuer, {
    clients: [
      {
        client_id: clientId,
        client_secret: clientSecret,
        grant_types: ['authorization_code', 'client_credentials'],
        response_types: ['code'],
        redirect_uris: redirectUris,
        post_logout_redirect_uris: postLogoutRedirectUris,
        token_endpoint_auth_method: 'client_secret_post',
      },
    ],
    pkce: { required: () => true, methods: ['S256'] },
    features: {
      devInteractions: { enabled: false },
      clientCredentials: { enabled: true },
      revocation: { enabled: true },
      rpInitiatedLogout: { enabled: true },
    },
    findAccount: async (_ctx: unknown, sub: string) => {
      const account = Object.values(users).find(u => u.sub === sub) ?? nextLogin
      return {
        accountId: account.sub,
        async claims() {
          return {
            sub: account.sub,
            name: account.name,
            given_name: account.given_name,
            family_name: account.family_name,
            email: account.email,
            email_verified: true,
            preferred_username: account.preferred_username,
            roles: account.roles,
          }
        },
      }
    },
    claims: {
      openid: ['sub'],
      profile: ['name', 'given_name', 'family_name', 'preferred_username'],
      email: ['email', 'email_verified'],
      roles: ['roles'],
    },
    extraTokenClaims: async (_ctx: unknown, token: { accountId?: string }) => {
      const sub = token.accountId
      const account = Object.values(users).find(u => u.sub === sub)
      return account ? { roles: account.roles } : {}
    },
  })

  const callback = provider.callback()
  const server = createServer(callback) as Server
  await new Promise<void>(resolve => {
    server.listen(port, '127.0.0.1', () => resolve())
  })

  return {
    issuer,
    clientId,
    clientSecret,
    setUser(user) {
      users[user.preferred_username ?? user.sub] = user
    },
    loginAs(usernameOrRole) {
      const user = users[usernameOrRole]
      if (!user) {
        throw new Error(
          `Unknown mock user/role "${usernameOrRole}". Known: ${Object.keys(
            users,
          ).join(', ')}`,
        )
      }
      nextLogin = user
    },
    async close() {
      await new Promise<void>((resolve, reject) => {
        server.close(err => (err ? reject(err) : resolve()))
      })
    },
  }
}
