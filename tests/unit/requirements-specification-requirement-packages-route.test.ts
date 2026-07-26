import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  assertAuthorized: vi.fn(),
  createRequirementsRestRuntime: vi.fn(),
  getSpecificationById: vi.fn(),
  queryPage: vi.fn(),
}))

vi.mock('@/lib/dal/requirements-specifications', () => ({
  getSpecificationById: (...args: unknown[]) =>
    mocks.getSpecificationById(...args),
}))

vi.mock('@/lib/requirements/server', () => ({
  createRequirementsRestRuntime: (...args: unknown[]) =>
    mocks.createRequirementsRestRuntime(...args),
}))

vi.mock('@/lib/requirements/service-shared', () => ({
  authorize: (
    authorization: { assertAuthorized: (...args: unknown[]) => unknown },
    action: unknown,
    contextValue: unknown,
  ) => authorization.assertAuthorized(action, contextValue),
}))

vi.mock('@/lib/requirements/specification-requirement-packages', async () => {
  const actual = await vi.importActual<
    typeof import('@/lib/requirements/specification-requirement-packages')
  >('@/lib/requirements/specification-requirement-packages')
  return {
    ...actual,
    querySpecificationRequirementPackagePage: (...args: unknown[]) =>
      mocks.queryPage(...args),
  }
})

import { GET } from '@/app/api/requirements-specifications/[id]/requirement-packages/route'
import { forbiddenError, invalidCursorError } from '@/lib/requirements/errors'

const db = { query: vi.fn() }
const context = {
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

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) }
}

async function expectInvalidRequest(
  response: Response,
  path: string,
): Promise<void> {
  expect(response.status).toBe(400)
  await expect(response.json()).resolves.toEqual(
    expect.objectContaining({
      error: 'Invalid request',
      issues: expect.arrayContaining([expect.objectContaining({ path })]),
    }),
  )
}

describe('requirements specification requirement-packages route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.createRequirementsRestRuntime.mockResolvedValue({
      authorization: { assertAuthorized: mocks.assertAuthorized },
      context,
      db,
    })
    mocks.getSpecificationById.mockResolvedValue({ id: 7 })
    mocks.queryPage.mockResolvedValue({
      pagination: {
        count: 1,
        hasMore: true,
        limit: 50,
        nextCursor: 'next-page',
      },
      requirementPackages: [
        { id: 2, name: 'Current package', purposeAndScope: 'Scope' },
      ],
      selectedRequirementPackages: [
        { id: 9, name: 'Selected package', purposeAndScope: null },
      ],
    })
  })

  it('returns a bounded page and resolves selected IDs authoritatively', async () => {
    const response = await GET(
      new NextRequest(
        'http://localhost/api/requirements-specifications/7/requirement-packages?limit=50&search=current&includeIds=9&includeIds=11',
      ),
      makeParams('7'),
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      pagination: {
        count: 1,
        hasMore: true,
        limit: 50,
        nextCursor: 'next-page',
      },
      requirementPackages: [
        { id: 2, name: 'Current package', purposeAndScope: 'Scope' },
      ],
      selectedRequirementPackages: [
        { id: 9, name: 'Selected package', purposeAndScope: null },
      ],
    })
    expect(mocks.assertAuthorized).toHaveBeenCalledWith(
      { kind: 'get_specification_items', specificationId: 7 },
      context,
    )
    expect(mocks.queryPage).toHaveBeenCalledWith(db, {
      includeIds: [9, 11],
      limit: 50,
      search: 'current',
      specificationId: 7,
    })
  })

  it('returns a confirmed empty page', async () => {
    mocks.queryPage.mockResolvedValueOnce({
      pagination: {
        count: 0,
        hasMore: false,
        limit: 50,
        nextCursor: null,
      },
      requirementPackages: [],
      selectedRequirementPackages: [],
    })

    const response = await GET(
      new NextRequest(
        'http://localhost/api/requirements-specifications/7/requirement-packages',
      ),
      makeParams('7'),
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      pagination: {
        count: 0,
        hasMore: false,
        limit: 50,
        nextCursor: null,
      },
      requirementPackages: [],
      selectedRequirementPackages: [],
    })
  })

  it('validates limit, unique include IDs, cursor, search, and array bounds', async () => {
    await expectInvalidRequest(
      await GET(
        new NextRequest(
          'http://localhost/api/requirements-specifications/7/requirement-packages?limit=101',
        ),
        makeParams('7'),
      ),
      'limit',
    )
    await expectInvalidRequest(
      await GET(
        new NextRequest(
          'http://localhost/api/requirements-specifications/7/requirement-packages?includeIds=2&includeIds=2',
        ),
        makeParams('7'),
      ),
      'includeIds',
    )
    await expectInvalidRequest(
      await GET(
        new NextRequest(
          `http://localhost/api/requirements-specifications/7/requirement-packages?cursor=${'x'.repeat(2049)}`,
        ),
        makeParams('7'),
      ),
      'cursor',
    )
    await expectInvalidRequest(
      await GET(
        new NextRequest(
          `http://localhost/api/requirements-specifications/7/requirement-packages?search=${'x'.repeat(251)}`,
        ),
        makeParams('7'),
      ),
      'search',
    )
    const ids = new URLSearchParams()
    for (let id = 1; id <= 201; id += 1) ids.append('includeIds', String(id))
    await expectInvalidRequest(
      await GET(
        new NextRequest(
          `http://localhost/api/requirements-specifications/7/requirement-packages?${ids}`,
        ),
        makeParams('7'),
      ),
      'includeIds',
    )
    expect(mocks.createRequirementsRestRuntime).not.toHaveBeenCalled()
  })

  it('returns not found before catalog work', async () => {
    mocks.getSpecificationById.mockResolvedValueOnce(null)

    const response = await GET(
      new NextRequest(
        'http://localhost/api/requirements-specifications/99/requirement-packages',
      ),
      makeParams('99'),
    )

    expect(response.status).toBe(404)
    expect(mocks.queryPage).not.toHaveBeenCalled()
  })

  it('maps authorization, invalid cursor, and catalog failures to HTTP errors', async () => {
    mocks.assertAuthorized.mockRejectedValueOnce(forbiddenError('Forbidden'))
    const forbidden = await GET(
      new NextRequest(
        'http://localhost/api/requirements-specifications/7/requirement-packages',
      ),
      makeParams('7'),
    )
    expect(forbidden.status).toBe(403)

    mocks.queryPage.mockRejectedValueOnce(invalidCursorError())
    const invalidCursor = await GET(
      new NextRequest(
        'http://localhost/api/requirements-specifications/7/requirement-packages?cursor=stale',
      ),
      makeParams('7'),
    )
    expect(invalidCursor.status).toBe(400)
    await expect(invalidCursor.json()).resolves.toMatchObject({
      code: 'invalid_cursor',
    })

    mocks.queryPage.mockRejectedValueOnce(new Error('database unavailable'))
    const failure = await GET(
      new NextRequest(
        'http://localhost/api/requirements-specifications/7/requirement-packages',
      ),
      makeParams('7'),
    )
    expect(failure.status).toBe(500)
    await expect(failure.json()).resolves.toEqual({
      code: 'internal',
      error: 'An internal error occurred',
    })
  })
})
