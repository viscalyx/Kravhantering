import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DELETE,
  GET,
  PATCH,
  POST,
} from '@/app/api/requirements-specifications/[id]/needs-references/route'
import { conflictError } from '@/lib/requirements/errors'

const mockDb = {}

const mocks = {
  assertAuthorized: vi.fn(),
  createRequirementsRestRuntime: vi.fn(),
  createSpecificationNeedsReference: vi.fn(),
  deleteSpecificationNeedsReference: vi.fn(),
  getSpecificationById: vi.fn(),
  listSpecificationNeedsReferences: vi.fn(),
  updateSpecificationNeedsReference: vi.fn(),
}

const mockContext = {
  actor: {
    displayName: 'Route Tester',
    hsaId: 'SE5560000001-route',
    id: 'route-test',
    isAuthenticated: true,
    roles: ['RequirementsEditor'],
    source: 'oidc',
  },
  correlationId: 'correlation-1',
  requestId: 'request-1',
  source: 'rest',
}

vi.mock('@/lib/db', () => ({
  getRequestSqlServerDataSource: () => mockDb,
}))

vi.mock('@/lib/dal/requirements-specifications', () => ({
  createSpecificationNeedsReference: (...args: unknown[]) =>
    mocks.createSpecificationNeedsReference(...args),
  deleteSpecificationNeedsReference: (...args: unknown[]) =>
    mocks.deleteSpecificationNeedsReference(...args),
  getSpecificationById: (...args: unknown[]) =>
    mocks.getSpecificationById(...args),
  listSpecificationNeedsReferences: (...args: unknown[]) =>
    mocks.listSpecificationNeedsReferences(...args),
  updateSpecificationNeedsReference: (...args: unknown[]) =>
    mocks.updateSpecificationNeedsReference(...args),
}))

vi.mock('@/lib/requirements/auth', async importOriginal => {
  const actual =
    await importOriginal<typeof import('@/lib/requirements/auth')>()
  return {
    ...actual,
    createDefaultAuthorizationService: () => ({ assertAuthorized: vi.fn() }),
    createRequestContext: vi.fn(async () => mockContext),
  }
})

vi.mock('@/lib/requirements/server', () => ({
  createRequirementsRestRuntime: (...args: unknown[]) =>
    mocks.createRequirementsRestRuntime(...args),
}))

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) }
}

function makeMutationRequest(
  method: 'DELETE' | 'PATCH' | 'POST',
  body: unknown,
) {
  return new NextRequest(
    'http://localhost/api/requirements-specifications/5/needs-references',
    {
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
      method,
    },
  )
}

describe('requirements-specifications/[id]/needs-references route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.createRequirementsRestRuntime.mockResolvedValue({
      authorization: { assertAuthorized: mocks.assertAuthorized },
      context: mockContext,
      db: mockDb,
    })
    mocks.createSpecificationNeedsReference.mockResolvedValue({
      description: 'For IAM work',
      id: 11,
      text: 'IAM-42',
    })
    mocks.deleteSpecificationNeedsReference.mockResolvedValue(true)
    mocks.getSpecificationById.mockResolvedValue({ id: 5 })
    mocks.listSpecificationNeedsReferences.mockResolvedValue([
      {
        description: 'For IAM work',
        id: 11,
        linkedItemCount: 2,
        text: 'IAM-42',
      },
    ])
    mocks.updateSpecificationNeedsReference.mockResolvedValue({
      description: 'Updated',
      id: 11,
      linkedItemCount: 2,
      text: 'IAM-43',
    })
    mocks.assertAuthorized.mockResolvedValue(undefined)
  })

  it('lists specification needs references', async () => {
    const response = await GET(
      new NextRequest(
        'http://localhost/api/requirements-specifications/5/needs-references',
      ),
      makeParams('5'),
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      needsReferences: [
        {
          description: 'For IAM work',
          id: 11,
          linkedItemCount: 2,
          text: 'IAM-42',
        },
      ],
    })
    expect(mocks.listSpecificationNeedsReferences).toHaveBeenCalledWith(
      mockDb,
      5,
    )
  })

  it('rejects invalid and missing needs-reference scopes', async () => {
    const invalid = await GET(
      new NextRequest(
        'http://localhost/api/requirements-specifications/nope/needs-references',
      ),
      makeParams('nope'),
    )
    mocks.getSpecificationById.mockResolvedValueOnce(null)
    const missing = await GET(
      new NextRequest(
        'http://localhost/api/requirements-specifications/404/needs-references',
      ),
      makeParams('404'),
    )

    expect(invalid.status).toBe(400)
    expect(missing.status).toBe(404)
    expect(mocks.listSpecificationNeedsReferences).not.toHaveBeenCalled()
  })

  it('maps authorization and list failures for needs references', async () => {
    mocks.assertAuthorized.mockRejectedValueOnce(
      new Error('authorization unavailable'),
    )
    const denied = await GET(
      new NextRequest(
        'http://localhost/api/requirements-specifications/5/needs-references',
      ),
      makeParams('5'),
    )
    mocks.listSpecificationNeedsReferences.mockRejectedValueOnce(
      new Error('database unavailable'),
    )
    const failed = await GET(
      new NextRequest(
        'http://localhost/api/requirements-specifications/5/needs-references',
      ),
      makeParams('5'),
    )

    expect(denied.status).toBe(500)
    expect(failed.status).toBe(500)
  })

  it('creates a needs reference with an optional description', async () => {
    const response = await POST(
      makeMutationRequest('POST', {
        description: 'For IAM work',
        text: 'IAM-42',
      }),
      makeParams('5'),
    )

    expect(response.status).toBe(201)
    expect(mocks.createSpecificationNeedsReference).toHaveBeenCalledWith(
      mockDb,
      5,
      { description: 'For IAM work', text: 'IAM-42' },
    )
  })

  it('creates a needs reference with a null description default', async () => {
    const response = await POST(
      makeMutationRequest('POST', { text: 'IAM-42' }),
      makeParams('5'),
    )

    expect(response.status).toBe(201)
    expect(mocks.createSpecificationNeedsReference).toHaveBeenCalledWith(
      mockDb,
      5,
      { description: null, text: 'IAM-42' },
    )
  })

  it('returns conflict when creating a duplicate needs reference', async () => {
    mocks.createSpecificationNeedsReference.mockRejectedValueOnce(
      conflictError('Needs reference already exists in this specification', {
        reason: 'duplicate_needs_reference',
      }),
    )

    const response = await POST(
      makeMutationRequest('POST', { text: 'IAM-42' }),
      makeParams('5'),
    )

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({
      code: 'conflict',
      error: 'Needs reference already exists in this specification',
    })
  })

  it('updates a needs reference', async () => {
    const response = await PATCH(
      makeMutationRequest('PATCH', {
        description: 'Updated',
        id: 11,
        text: 'IAM-43',
      }),
      makeParams('5'),
    )

    expect(response.status).toBe(200)
    expect(mocks.updateSpecificationNeedsReference).toHaveBeenCalledWith(
      mockDb,
      5,
      11,
      { description: 'Updated', text: 'IAM-43' },
    )
  })

  it('updates a needs reference with a null description default', async () => {
    const response = await PATCH(
      makeMutationRequest('PATCH', { id: 11, text: 'IAM-43' }),
      makeParams('5'),
    )

    expect(response.status).toBe(200)
    expect(mocks.updateSpecificationNeedsReference).toHaveBeenCalledWith(
      mockDb,
      5,
      11,
      { description: null, text: 'IAM-43' },
    )
  })

  it('blocks deleting needs references that are in use', async () => {
    mocks.deleteSpecificationNeedsReference.mockRejectedValueOnce(
      conflictError(
        'Needs reference is used by requirement applications or unique requirements',
        {
          linkedItemCount: 2,
          reason: 'needs_reference_in_use',
        },
      ),
    )

    const response = await DELETE(
      makeMutationRequest('DELETE', { id: 11 }),
      makeParams('5'),
    )

    expect(response.status).toBe(409)
  })

  it('deletes unused needs references', async () => {
    const response = await DELETE(
      makeMutationRequest('DELETE', { id: 11 }),
      makeParams('5'),
    )

    expect(response.status).toBe(200)
    expect(mocks.deleteSpecificationNeedsReference).toHaveBeenCalledWith(
      mockDb,
      5,
      11,
    )
  })

  it.each([
    ['POST', POST, { text: 'IAM-42' }],
    ['PATCH', PATCH, { id: 11, text: 'IAM-43' }],
    ['DELETE', DELETE, { id: 11 }],
  ] as const)(
    '%s returns not found when the owning specification disappears',
    async (method, handler, body) => {
      mocks.getSpecificationById.mockResolvedValueOnce(null)

      const response = await handler(
        makeMutationRequest(method, body),
        makeParams('404'),
      )

      expect(response.status).toBe(404)
    },
  )

  it('returns not found when a needs reference was not deleted', async () => {
    mocks.deleteSpecificationNeedsReference.mockResolvedValueOnce(false)

    const response = await DELETE(
      makeMutationRequest('DELETE', { id: 999 }),
      makeParams('5'),
    )

    expect(response.status).toBe(404)
  })

  it.each([
    ['POST', POST, {}],
    ['PATCH', PATCH, { id: 0, text: '' }],
    ['DELETE', DELETE, { id: 0 }],
  ] as const)(
    'rejects invalid %s payloads before persistence',
    async (method, handler, body) => {
      const response = await handler(
        makeMutationRequest(method, body),
        makeParams('5'),
      )

      expect(response.status).toBe(400)
    },
  )
})
