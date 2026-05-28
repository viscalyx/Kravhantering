import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DELETE,
  GET,
  PATCH,
  POST,
} from '@/app/api/specifications/[id]/needs-references/route'
import { conflictError } from '@/lib/requirements/errors'

const mockDb = {}

const mocks = {
  createSpecificationNeedsReference: vi.fn(),
  deleteSpecificationNeedsReference: vi.fn(),
  getSpecificationById: vi.fn(),
  getSpecificationBySlug: vi.fn(),
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
  getSpecificationBySlug: (...args: unknown[]) =>
    mocks.getSpecificationBySlug(...args),
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

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) }
}

function makeMutationRequest(
  method: 'DELETE' | 'PATCH' | 'POST',
  body: unknown,
) {
  return new NextRequest(
    'http://localhost/api/specifications/spec/needs-references',
    {
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
      method,
    },
  )
}

describe('specifications/[id]/needs-references route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.createSpecificationNeedsReference.mockResolvedValue({
      description: 'For IAM work',
      id: 11,
      text: 'IAM-42',
    })
    mocks.deleteSpecificationNeedsReference.mockResolvedValue(true)
    mocks.getSpecificationById.mockResolvedValue(null)
    mocks.getSpecificationBySlug.mockResolvedValue({ id: 5 })
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
  })

  it('lists specification needs references', async () => {
    const response = await GET(
      new NextRequest(
        'http://localhost/api/specifications/spec/needs-references',
      ),
      makeParams('spec'),
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

  it('creates a needs reference with an optional description', async () => {
    const response = await POST(
      makeMutationRequest('POST', {
        description: 'For IAM work',
        text: 'IAM-42',
      }),
      makeParams('spec'),
    )

    expect(response.status).toBe(201)
    expect(mocks.createSpecificationNeedsReference).toHaveBeenCalledWith(
      mockDb,
      5,
      { description: 'For IAM work', text: 'IAM-42' },
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
      makeParams('spec'),
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
      makeParams('spec'),
    )

    expect(response.status).toBe(200)
    expect(mocks.updateSpecificationNeedsReference).toHaveBeenCalledWith(
      mockDb,
      5,
      11,
      { description: 'Updated', text: 'IAM-43' },
    )
  })

  it('blocks deleting needs references that are in use', async () => {
    mocks.deleteSpecificationNeedsReference.mockRejectedValueOnce(
      conflictError('Needs reference is used by specification items', {
        linkedItemCount: 2,
        reason: 'needs_reference_in_use',
      }),
    )

    const response = await DELETE(
      makeMutationRequest('DELETE', { id: 11 }),
      makeParams('spec'),
    )

    expect(response.status).toBe(409)
  })

  it('deletes unused needs references', async () => {
    const response = await DELETE(
      makeMutationRequest('DELETE', { id: 11 }),
      makeParams('spec'),
    )

    expect(response.status).toBe(200)
    expect(mocks.deleteSpecificationNeedsReference).toHaveBeenCalledWith(
      mockDb,
      5,
      11,
    )
  })
})
