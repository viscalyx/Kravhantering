import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockDb = {}
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

const mocks = {
  getSpecificationById: vi.fn(),
  getSpecificationByRef: vi.fn(),
  getSpecificationBySlug: vi.fn(),
  getSpecificationItemByRef: vi.fn(),
  listSpecificationItems: vi.fn(),
  updateSpecificationItemFieldsByItemRef: vi.fn(),
}

vi.mock('@/lib/db', () => ({
  getRequestSqlServerDataSource: () => mockDb,
}))

vi.mock('@/lib/dal/requirements-specifications', () => ({
  getSpecificationById: (...args: unknown[]) =>
    mocks.getSpecificationById(...args),
  getSpecificationBySlug: (...args: unknown[]) =>
    mocks.getSpecificationBySlug(...args),
  getSpecificationItemByRef: (...args: unknown[]) =>
    mocks.getSpecificationItemByRef(...args),
  listSpecificationItems: (...args: unknown[]) =>
    mocks.listSpecificationItems(...args),
  updateSpecificationItemFieldsByItemRef: (...args: unknown[]) =>
    mocks.updateSpecificationItemFieldsByItemRef(...args),
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

import { GET, PATCH } from '@/app/api/specifications/[id]/items/[itemId]/route'

function makeParams(id: string, itemId: string) {
  return { params: Promise.resolve({ id, itemId }) }
}

async function expectInvalidRequest(
  response: Response,
  path?: string,
): Promise<void> {
  const body = (await response.json()) as {
    error: string
    issues: Array<{ path: string }>
  }
  expect(body.error).toBe('Invalid request')
  expect(body.issues.length).toBeGreaterThan(0)
  if (path) {
    expect(body.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ path })]),
    )
  }
}

describe('requirements-specifications/[id]/items/[itemId] route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getSpecificationBySlug.mockResolvedValue({ id: 5 })
  })

  it('returns specification-specific metadata for a library requirement item', async () => {
    mocks.listSpecificationItems.mockResolvedValue([
      {
        kind: 'library',
        needsReference: 'Shared specification need',
        needsReferenceId: 81,
        specificationItemId: 31,
        specificationItemStatusColor: '#f59e0b',
        specificationItemStatusId: 2,
        specificationItemStatusNameEn: 'Ongoing',
        specificationItemStatusNameSv: 'Pågående',
      },
    ])

    const request = new NextRequest(
      'http://localhost/api/specifications/ETJANST-UPP-2026/items/31',
    )

    const response = await GET(request, makeParams('ETJANST-UPP-2026', '31'))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      needsReference: 'Shared specification need',
      needsReferenceId: 81,
      specificationItemId: 31,
      specificationItemStatusColor: '#f59e0b',
      specificationItemStatusIconName: null,
      specificationItemStatusId: 2,
      specificationItemStatusNameEn: 'Ongoing',
      specificationItemStatusNameSv: 'Pågående',
    })
    expect(mocks.listSpecificationItems).toHaveBeenCalledWith(mockDb, 5)
  })

  it('updates specification item status by item ref within the specification', async () => {
    mocks.getSpecificationBySlug.mockResolvedValue({ id: 7 })
    mocks.getSpecificationItemByRef.mockResolvedValue({
      itemRef: 'lib:31',
      specificationId: 7,
      specificationItemId: 31,
    })

    const request = new NextRequest(
      'http://localhost/api/specifications/ETJANST-UPP-2026/items/lib%3A31',
      {
        body: JSON.stringify({ specificationItemStatusId: 5 }),
        headers: { 'Content-Type': 'application/json' },
        method: 'PATCH',
      },
    )

    const response = await PATCH(
      request,
      makeParams('ETJANST-UPP-2026', 'lib%3A31'),
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true })
    expect(mocks.getSpecificationItemByRef).toHaveBeenCalledWith(
      mockDb,
      7,
      'lib:31',
    )
    expect(mocks.updateSpecificationItemFieldsByItemRef).toHaveBeenCalledWith(
      mockDb,
      7,
      'lib:31',
      { specificationItemStatusId: 5 },
    )
  })

  it.each([
    0,
    -1,
    1.5,
    null,
    '2',
  ])('rejects malformed specification item status id %s', async specificationItemStatusId => {
    const request = new NextRequest(
      'http://localhost/api/specifications/ETJANST-UPP-2026/items/lib%3A31',
      {
        body: JSON.stringify({ specificationItemStatusId }),
        headers: { 'Content-Type': 'application/json' },
        method: 'PATCH',
      },
    )

    const response = await PATCH(
      request,
      makeParams('ETJANST-UPP-2026', 'lib%3A31'),
    )

    expect(response.status).toBe(400)
    await expectInvalidRequest(response, 'specificationItemStatusId')
    expect(mocks.getSpecificationBySlug).not.toHaveBeenCalled()
    expect(mocks.updateSpecificationItemFieldsByItemRef).not.toHaveBeenCalled()
  })

  it('allows note-only item updates without a status field', async () => {
    mocks.getSpecificationBySlug.mockResolvedValue({ id: 7 })
    mocks.getSpecificationItemByRef.mockResolvedValue({
      itemRef: 'lib:31',
      specificationId: 7,
      specificationItemId: 31,
    })

    const request = new NextRequest(
      'http://localhost/api/specifications/ETJANST-UPP-2026/items/lib%3A31',
      {
        body: JSON.stringify({ note: 'Follow-up' }),
        headers: { 'Content-Type': 'application/json' },
        method: 'PATCH',
      },
    )

    const response = await PATCH(
      request,
      makeParams('ETJANST-UPP-2026', 'lib%3A31'),
    )

    expect(response.status).toBe(200)
    expect(mocks.updateSpecificationItemFieldsByItemRef).toHaveBeenCalledWith(
      mockDb,
      7,
      'lib:31',
      { note: 'Follow-up' },
    )
  })

  it('rejects empty patch payloads before resolving the specification', async () => {
    const request = new NextRequest(
      'http://localhost/api/specifications/ETJANST-UPP-2026/items/lib%3A31',
      {
        body: JSON.stringify({}),
        headers: { 'Content-Type': 'application/json' },
        method: 'PATCH',
      },
    )

    const response = await PATCH(
      request,
      makeParams('ETJANST-UPP-2026', 'lib%3A31'),
    )
    const body = (await response.json()) as {
      error: string
      issues: Array<{ message: string }>
    }

    expect(response.status).toBe(400)
    expect(body.error).toBe('Invalid request')
    expect(body.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message:
            'At least one of note or specificationItemStatusId must be supplied',
        }),
      ]),
    )
    expect(mocks.getSpecificationBySlug).not.toHaveBeenCalled()
    expect(mocks.updateSpecificationItemFieldsByItemRef).not.toHaveBeenCalled()
  })
})
