import { NextResponse } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { CsrfError } from '@/lib/auth/csrf'
import {
  adminMutationPolicy,
  customMutationPolicy,
  requirementsMutationPolicy,
  secureLogoutMutationRoute,
  secureMutationRoute,
} from '@/lib/http/secure-mutation-route'
import { forbiddenError } from '@/lib/requirements/errors'

const authState = vi.hoisted(() => ({
  assertAuthorized: vi.fn(),
  createRequestContext: vi.fn(),
}))

const adminAuditState = vi.hoisted(() => ({
  createAdminPrivilegedAuditContext: vi.fn(),
}))

vi.mock('@/lib/admin/privileged-audit', async importOriginal => {
  const actual =
    await importOriginal<typeof import('@/lib/admin/privileged-audit')>()
  return {
    ...actual,
    createAdminPrivilegedAuditContext:
      adminAuditState.createAdminPrivilegedAuditContext,
  }
})

vi.mock('@/lib/requirements/auth', async importOriginal => {
  const actual =
    await importOriginal<typeof import('@/lib/requirements/auth')>()
  return {
    ...actual,
    createDefaultAuthorizationService: () => ({
      assertAuthorized: authState.assertAuthorized,
    }),
    createRequestContext: authState.createRequestContext,
  }
})

vi.mock('@/lib/http/safe-errors', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/http/safe-errors')>()
  return {
    ...actual,
    logSanitizedError: vi.fn(),
  }
})

function context(roles: string[] = ['Admin']) {
  return {
    actor: {
      displayName: 'Ada Admin',
      hsaId: 'SE2321000032-admin1',
      id: 'admin-sub',
      isAuthenticated: true,
      roles,
      source: 'oidc',
    },
    correlationId: 'correlation-1',
    request: {
      method: 'POST',
      path: '/api/example',
      requestId: 'request-1',
    },
    requestId: 'request-1',
    source: 'rest',
  }
}

function jsonRequest(body: unknown, method = 'POST') {
  return new Request('http://localhost/api/example', {
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
    method,
  })
}

describe('secureMutationRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    adminAuditState.createAdminPrivilegedAuditContext.mockResolvedValue(
      context(),
    )
    authState.createRequestContext.mockResolvedValue(context())
  })

  it('passes parsed body, params and context to the handler', async () => {
    const handler = vi.fn(() => NextResponse.json({ ok: true }))
    const route = secureMutationRoute({
      bodySchema: z.object({ name: z.string() }).strict(),
      handler,
      paramsSchema: z.object({ id: z.string() }).strict(),
      policy: adminMutationPolicy(),
    })

    const response = await route(jsonRequest({ name: 'Valid' }), {
      params: Promise.resolve({ id: '42' }),
    })

    expect(response.status).toBe(200)
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        body: { name: 'Valid' },
        context: expect.objectContaining({ requestId: 'request-1' }),
        params: { id: '42' },
      }),
    )
  })

  it('rejects unauthenticated actors before validation and handler work', async () => {
    adminAuditState.createAdminPrivilegedAuditContext.mockResolvedValueOnce({
      ...context([]),
      actor: { ...context([]).actor, isAuthenticated: false },
    })
    const handler = vi.fn(() => NextResponse.json({ ok: true }))
    const route = secureMutationRoute({
      bodySchema: z.object({ name: z.string() }).strict(),
      handler,
      policy: adminMutationPolicy(),
    })

    const response = await route(jsonRequest({}))

    expect(response.status).toBe(401)
    expect(handler).not.toHaveBeenCalled()
  })

  it('runs pre-parse guards before body validation and handler work', async () => {
    const handler = vi.fn(() => NextResponse.json({ ok: true }))
    const preParse = vi.fn(() =>
      NextResponse.json({ error: 'Too many requests' }, { status: 429 }),
    )
    const route = secureMutationRoute({
      bodySchema: z.object({ name: z.string() }).strict(),
      handler,
      policy: adminMutationPolicy(),
      preParse,
    })

    const response = await route(jsonRequest({}))

    expect(response.status).toBe(429)
    expect(preParse).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.objectContaining({ requestId: 'request-1' }),
      }),
    )
    expect(handler).not.toHaveBeenCalled()
  })

  it('rejects invalid route params before the handler runs', async () => {
    const handler = vi.fn(() => NextResponse.json({ ok: true }))
    const route = secureMutationRoute({
      handler,
      paramsSchema: z.object({ id: z.coerce.number().int() }).strict(),
      policy: adminMutationPolicy(),
    })

    const response = await route(jsonRequest({}), {
      params: Promise.resolve({ id: 'abc' }),
    })

    expect(response.status).toBe(400)
    expect(handler).not.toHaveBeenCalled()
  })

  it('rejects invalid JSON body before policy and handler work', async () => {
    const handler = vi.fn(() => NextResponse.json({ ok: true }))
    const route = secureMutationRoute({
      bodySchema: z.object({ name: z.string() }).strict(),
      handler,
      policy: requirementsMutationPolicy({ kind: 'generate_requirements' }),
    })

    const response = await route(
      new Request('http://localhost/api/example', {
        body: '{',
        method: 'POST',
      }),
    )

    expect(response.status).toBe(400)
    expect(authState.assertAuthorized).not.toHaveBeenCalled()
    expect(handler).not.toHaveBeenCalled()
  })

  it('runs requirements authorization before the handler', async () => {
    const handler = vi.fn(() => NextResponse.json({ ok: true }))
    const route = secureMutationRoute({
      handler,
      policy: requirementsMutationPolicy({ kind: 'generate_requirements' }),
    })

    await route(jsonRequest({}))

    expect(authState.assertAuthorized).toHaveBeenCalledWith(
      { kind: 'generate_requirements' },
      expect.objectContaining({ requestId: 'request-1' }),
    )
    expect(authState.assertAuthorized.mock.invocationCallOrder[0]).toBeLessThan(
      handler.mock.invocationCallOrder[0],
    )
  })

  it('returns policy denials without running the handler', async () => {
    const handler = vi.fn(() => NextResponse.json({ ok: true }))
    const route = secureMutationRoute({
      handler,
      policy: customMutationPolicy('deny', () => {
        throw forbiddenError('Nope')
      }),
    })

    const response = await route(jsonRequest({}))

    expect(response.status).toBe(403)
    expect(handler).not.toHaveBeenCalled()
  })

  it('maps CSRF failures from context creation', async () => {
    adminAuditState.createAdminPrivilegedAuditContext.mockRejectedValueOnce(
      new CsrfError('Cross-origin request rejected.'),
    )
    const handler = vi.fn(() => NextResponse.json({ ok: true }))
    const route = secureMutationRoute({
      handler,
      policy: adminMutationPolicy(),
    })

    const response = await route(jsonRequest({}))

    expect(response.status).toBe(403)
    expect(handler).not.toHaveBeenCalled()
  })

  it('maps unexpected handler errors to sanitized 500 responses', async () => {
    const route = secureMutationRoute({
      handler: () => {
        throw new Error('SELECT token FROM sessions')
      },
      policy: adminMutationPolicy(),
    })

    const response = await route(jsonRequest({}))

    expect(response.status).toBe(500)
  })
})

describe('secureLogoutMutationRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    adminAuditState.createAdminPrivilegedAuditContext.mockResolvedValue(
      context(),
    )
    authState.createRequestContext.mockResolvedValue(context())
  })

  it('requires request context before logout handler work', async () => {
    const handler = vi.fn(() => NextResponse.json({ ok: true }))
    const route = secureLogoutMutationRoute(handler)

    const response = await route(jsonRequest({}))

    expect(response.status).toBe(200)
    expect(authState.createRequestContext).toHaveBeenCalled()
    expect(handler).toHaveBeenCalled()
  })
})
