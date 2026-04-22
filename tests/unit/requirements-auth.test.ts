import { describe, expect, it } from 'vitest'
import {
  AllowAllAuthorizationService,
  createRequestContext,
  getActorContextFromRequest,
  RoleBasedAuthorizationService,
} from '@/lib/requirements/auth'

describe('requirements auth', () => {
  describe('getActorContextFromRequest', () => {
    it('returns anonymous context when no headers', () => {
      const req = new Request('http://localhost/test')
      const ctx = getActorContextFromRequest(req)
      expect(ctx.id).toBeNull()
      expect(ctx.isAuthenticated).toBe(false)
      expect(ctx.source).toBe('anonymous')
      expect(ctx.roles).toEqual([])
    })

    it('extracts user from headers', () => {
      const req = new Request('http://localhost/test', {
        headers: {
          'x-user-id': 'user-1',
          'x-user-roles': 'admin, editor',
        },
      })
      const ctx = getActorContextFromRequest(req)
      expect(ctx.id).toBe('user-1')
      expect(ctx.isAuthenticated).toBe(true)
      expect(ctx.source).toBe('headers')
      expect(ctx.roles).toEqual(['admin', 'editor'])
    })

    it('handles empty roles header', () => {
      const req = new Request('http://localhost/test', {
        headers: { 'x-user-id': 'user-1', 'x-user-roles': '' },
      })
      const ctx = getActorContextFromRequest(req)
      expect(ctx.roles).toEqual([])
    })
  })

  describe('createRequestContext', () => {
    it('creates context with request ID from header', async () => {
      const req = new Request('http://localhost/test', {
        headers: { 'x-request-id': 'req-abc' },
      })
      const ctx = await createRequestContext(req, 'rest')
      expect(ctx.requestId).toBe('req-abc')
      expect(ctx.source).toBe('rest')
    })

    it('generates request ID when not provided', async () => {
      const req = new Request('http://localhost/test')
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
              roles: ['admin'],
              source: 'headers',
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
              roles: ['viewer'],
              source: 'headers',
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
