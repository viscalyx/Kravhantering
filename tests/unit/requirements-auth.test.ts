import { describe, expect, it } from 'vitest'
import {
  AllowAllAuthorizationService,
  attachVerifiedActor,
  createRequestContext,
  RoleBasedAuthorizationService,
} from '@/lib/requirements/auth'

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
