import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resetAuthConfigForTests } from '@/lib/auth/config'
import {
  AllowAllAuthorizationService,
  attachVerifiedActor,
  createRequestContext,
  RoleBasedAuthorizationService,
} from '@/lib/requirements/auth'

const COOKIE_PASSWORD =
  'test-cookie-password-must-be-at-least-32-characters-long'

const TRACKED_ENV_KEYS = [
  'AUTH_OIDC_CLIENT_ID',
  'AUTH_OIDC_CLIENT_SECRET',
  'AUTH_OIDC_ISSUER_URL',
  'AUTH_OIDC_POST_LOGOUT_REDIRECT_URI',
  'AUTH_OIDC_REDIRECT_URI',
  'AUTH_SESSION_COOKIE_PASSWORD',
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

function buildAuthedRequest(url: string, init: RequestInit = {}): Request {
  const req = new Request(url, init)
  attachVerifiedActor(req, {
    id: 'user-1',
    displayName: 'User One',
    hsaId: null,
    roles: ['Admin'],
    source: 'oidc',
    isAuthenticated: true,
  })
  return req
}

describe('requirements auth', () => {
  beforeEach(() => {
    env.AUTH_OIDC_ISSUER_URL = 'https://issuer.example.com'
    env.AUTH_OIDC_CLIENT_ID = 'kravhantering-app'
    env.AUTH_OIDC_CLIENT_SECRET = 'secret'
    env.AUTH_OIDC_REDIRECT_URI = 'http://localhost:3000/api/auth/callback'
    env.AUTH_OIDC_POST_LOGOUT_REDIRECT_URI = 'http://localhost:3000/'
    env.AUTH_SESSION_COOKIE_PASSWORD = COOKIE_PASSWORD
    resetAuthConfigForTests()
  })

  afterEach(() => {
    restoreTrackedEnv()
    resetAuthConfigForTests()
  })

  describe('createRequestContext', () => {
    it('creates context with request ID from header', async () => {
      const req = buildAuthedRequest('http://localhost/test', {
        headers: { 'x-request-id': 'req-abc' },
      })
      const ctx = await createRequestContext(req, 'rest')
      expect(ctx.requestId).toBe('req-abc')
      expect(ctx.source).toBe('rest')
      expect(ctx.actor.isAuthenticated).toBe(true)
    })

    it('generates request ID when not provided', async () => {
      const req = buildAuthedRequest('http://localhost/test')
      const ctx = await createRequestContext(req, 'mcp', 'list_requirements')
      expect(ctx.requestId).toBeTruthy()
      expect(ctx.source).toBe('mcp')
      expect(ctx.toolName).toBe('list_requirements')
    })

    it('does not derive actor identity from spoofed x-user headers', async () => {
      const req = new Request('http://localhost/api/requirements', {
        headers: {
          'x-user-id': 'attacker',
          'x-user-roles': 'Admin',
        },
      })

      const ctx = await createRequestContext(req, 'rest')

      expect(ctx.actor).toEqual({
        id: null,
        displayName: '',
        hsaId: null,
        roles: [],
        source: 'anonymous',
        isAuthenticated: false,
      })
    })
  })

  describe('AllowAllAuthorizationService', () => {
    it('allows all actions', async () => {
      const service = new AllowAllAuthorizationService()
      await expect(service.assertAuthorized()).resolves.toBeUndefined()
    })
  })

  describe('RoleBasedAuthorizationService', () => {
    it('allows when actor has required role', async () => {
      const svc = new RoleBasedAuthorizationService({
        manage_requirement: ['admin'],
      })
      await expect(
        svc.assertAuthorized(
          { kind: 'manage_requirement', operation: 'create' },
          {
            actor: {
              id: 'u1',
              displayName: 'u1',
              hsaId: null,
              roles: ['admin'],
              source: 'oidc',
              isAuthenticated: true,
            },
            requestId: 'r1',
            source: 'rest',
          },
        ),
      ).resolves.toBeUndefined()
    })

    it('throws when actor lacks required role', async () => {
      const svc = new RoleBasedAuthorizationService({
        manage_requirement: ['admin'],
      })
      await expect(
        svc.assertAuthorized(
          { kind: 'manage_requirement', operation: 'create' },
          {
            actor: {
              id: 'u1',
              displayName: 'u1',
              hsaId: null,
              roles: ['viewer'],
              source: 'oidc',
              isAuthenticated: true,
            },
            requestId: 'r1',
            source: 'rest',
          },
        ),
      ).rejects.toThrow()
    })

    it('denies when no policy defined for action kind', async () => {
      const svc = new RoleBasedAuthorizationService({})
      await expect(
        svc.assertAuthorized(
          { kind: 'query_catalog', catalog: 'requirements' },
          {
            actor: {
              id: null,
              displayName: '',
              hsaId: null,
              roles: [],
              source: 'anonymous',
              isAuthenticated: false,
            },
            requestId: 'r1',
            source: 'rest',
          },
        ),
      ).rejects.toThrow('No policy defined for action query_catalog')
    })
  })
})
