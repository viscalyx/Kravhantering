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

export interface MockUser {
  email: string
  employeeHsaId: string
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
  AreaOwner: {
    sub: 'mock-areaowner-sub',
    given_name: 'Olle',
    family_name: 'AreaOwner',
    name: 'Olle AreaOwner',
    email: 'olle.areaowner@example.test',
    preferred_username: 'olle.areaowner',
    employeeHsaId: 'SE2321000032-areaowner1',
    roles: [],
  },
  AreaCoauthor: {
    sub: 'mock-areaco-sub',
    given_name: 'Cora',
    family_name: 'CoAuthor',
    name: 'Cora CoAuthor',
    email: 'cora.coauthor@example.test',
    preferred_username: 'cora.coauthor',
    employeeHsaId: 'SE2321000032-areaco1',
    roles: [],
  },
  PackageResp: {
    sub: 'mock-pkgresp-sub',
    given_name: 'Petra',
    family_name: 'PackageResp',
    name: 'Petra PackageResp',
    email: 'petra.packageresp@example.test',
    preferred_username: 'petra.packageresp',
    employeeHsaId: 'SE2321000032-pkgresp1',
    roles: [],
  },
  PackageCoauthor: {
    sub: 'mock-pkgco-sub',
    given_name: 'Paul',
    family_name: 'PkgCoAuthor',
    name: 'Paul PkgCoAuthor',
    email: 'paul.pkgcoauthor@example.test',
    preferred_username: 'paul.pkgcoauthor',
    employeeHsaId: 'SE2321000032-pkgco1',
    roles: [],
  },
  Reviewer: {
    sub: 'mock-reviewer-sub',
    given_name: 'Rita',
    family_name: 'Reviewer',
    name: 'Rita Reviewer',
    email: 'rita.reviewer@example.test',
    preferred_username: 'rita.reviewer',
    employeeHsaId: 'SE2321000032-reviewer1',
    roles: ['Reviewer'],
  },
  Admin: {
    sub: 'mock-admin-sub',
    given_name: 'Ada',
    family_name: 'Admin',
    name: 'Ada Admin',
    email: 'ada.admin@example.test',
    preferred_username: 'ada.admin',
    employeeHsaId: 'SE2321000032-admin1',
    roles: ['Admin'],
  },
  NoRoles: {
    sub: 'mock-noroles-sub',
    given_name: 'Noah',
    family_name: 'NoRoles',
    name: 'Noah NoRoles',
    email: 'noah.noroles@example.test',
    preferred_username: 'noah.noroles',
    employeeHsaId: 'SE2321000032-noroles1',
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
  // Lazy import keeps heavy OIDC dependencies out of tests that don't use the
  // mock while still letting TypeScript validate the Provider contract.
  const { default: Provider } = await import('oidc-provider')

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
    pkce: { required: () => true },
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
            employeeHsaId: account.employeeHsaId,
          }
        },
      }
    },
    claims: {
      openid: ['sub'],
      profile: ['name', 'given_name', 'family_name', 'preferred_username'],
      email: ['email', 'email_verified'],
      roles: ['roles'],
      employeeHsaId: ['employeeHsaId'],
    },
    extraTokenClaims: async (_ctx, token) => {
      const sub = token.kind === 'AccessToken' ? token.accountId : undefined
      const account = Object.values(users).find(u => u.sub === sub)
      return account
        ? { roles: account.roles, employeeHsaId: account.employeeHsaId }
        : {}
    },
  })

  const callback = provider.callback()
  portProbe.on('request', callback)
  const server = portProbe as Server

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
