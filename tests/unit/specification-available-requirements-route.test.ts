import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockDb = {}
const mockAuthorization = { assertAuthorized: vi.fn() }
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
  createRequirementsRestRuntime: vi.fn(),
  getExistingSpecificationRequirementIds: vi.fn(),
  getRequirementSelectionFilterForSpecification: vi.fn(),
  logSanitizedError: vi.fn(),
  queryRequirementList: vi.fn(),
  resolveSpecificationId: vi.fn(),
}

vi.mock('@/lib/dal/requirement-selection-questions', () => ({
  getExistingSpecificationRequirementIds: (...args: unknown[]) =>
    mocks.getExistingSpecificationRequirementIds(...args),
  getRequirementSelectionFilterForSpecification: (...args: unknown[]) =>
    mocks.getRequirementSelectionFilterForSpecification(...args),
  resolveSpecificationId: (...args: unknown[]) =>
    mocks.resolveSpecificationId(...args),
}))

vi.mock('@/lib/http/safe-errors', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/http/safe-errors')>()
  return {
    ...actual,
    logSanitizedError: (...args: unknown[]) => mocks.logSanitizedError(...args),
  }
})

vi.mock('@/lib/requirements/list-query', () => ({
  queryRequirementList: (...args: unknown[]) =>
    mocks.queryRequirementList(...args),
}))

vi.mock('@/lib/requirements/server', () => ({
  createRequirementsRestRuntime: (...args: unknown[]) =>
    mocks.createRequirementsRestRuntime(...args),
}))

import { GET } from '@/app/api/requirements-specifications/[id]/available-requirements/route'

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) }
}

describe('requirements-specifications/[id]/available-requirements route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.createRequirementsRestRuntime.mockResolvedValue({
      authorization: mockAuthorization,
      context: mockContext,
      db: mockDb,
    })
    mocks.getExistingSpecificationRequirementIds.mockResolvedValue([101, 102])
    mocks.getRequirementSelectionFilterForSpecification.mockResolvedValue({
      hasCurrentAnswers: false,
      hasRequirementSelection: false,
      hasNoRequirementSelection: false,
      requirementIds: [],
    })
    mocks.queryRequirementList.mockResolvedValue({
      pagination: { hasMore: false, total: 1 },
      requirements: [{ id: 201, uniqueId: 'IAM0201' }],
    })
    mocks.resolveSpecificationId.mockResolvedValue(6)
  })

  it('accepts legacy status query params while keeping the published-only filter', async () => {
    const response = await GET(
      new NextRequest(
        'http://localhost/api/requirements-specifications/IAM-INFOR-2026/available-requirements?limit=15&locale=sv&sortBy=uniqueId&sortDirection=asc&statuses=3',
      ),
      makeParams('IAM-INFOR-2026'),
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      pagination: { hasMore: false, total: 1 },
      requirements: [{ id: 201, uniqueId: 'IAM0201' }],
      selectionFilter: {
        applied: false,
        hasCurrentAnswers: false,
        hasRequirementSelection: false,
        hasNoRequirementSelection: false,
        requirementIds: [],
      },
    })
    expect(mocks.queryRequirementList).toHaveBeenCalledWith(
      mockDb,
      expect.objectContaining({
        filters: expect.objectContaining({
          statuses: [3],
        }),
        limit: 15,
        locale: 'sv',
        sort: { by: 'uniqueId', direction: 'asc' },
      }),
      { authorization: mockAuthorization, context: mockContext },
    )
    expect(mocks.queryRequirementList.mock.calls[0]?.[1]).not.toHaveProperty(
      'requirementIds',
    )
  })

  it('applies requirement-selection ids only when explicitly requested', async () => {
    mocks.getRequirementSelectionFilterForSpecification.mockResolvedValue({
      hasCurrentAnswers: true,
      hasRequirementSelection: true,
      hasNoRequirementSelection: false,
      requirementIds: [301, 302],
    })

    const response = await GET(
      new NextRequest(
        'http://localhost/api/requirements-specifications/IAM-INFOR-2026/available-requirements?applyRequirementSelectionFilter=true',
      ),
      makeParams('IAM-INFOR-2026'),
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      pagination: { hasMore: false, total: 1 },
      requirements: [{ id: 201, uniqueId: 'IAM0201' }],
      selectionFilter: {
        applied: true,
        hasCurrentAnswers: true,
        hasRequirementSelection: true,
        hasNoRequirementSelection: false,
        requirementIds: [301, 302],
      },
    })
    expect(mocks.queryRequirementList).toHaveBeenCalledWith(
      mockDb,
      expect.objectContaining({
        requirementIds: [301, 302],
      }),
      { authorization: mockAuthorization, context: mockContext },
    )
  })

  it('does not apply requirement-selection ids when the opt-in query param is absent', async () => {
    mocks.getRequirementSelectionFilterForSpecification.mockResolvedValue({
      hasCurrentAnswers: true,
      hasRequirementSelection: true,
      hasNoRequirementSelection: false,
      requirementIds: [301, 302],
    })

    const response = await GET(
      new NextRequest(
        'http://localhost/api/requirements-specifications/IAM-INFOR-2026/available-requirements',
      ),
      makeParams('IAM-INFOR-2026'),
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      pagination: { hasMore: false, total: 1 },
      requirements: [{ id: 201, uniqueId: 'IAM0201' }],
      selectionFilter: {
        applied: false,
        hasCurrentAnswers: true,
        hasRequirementSelection: true,
        hasNoRequirementSelection: false,
        requirementIds: [301, 302],
      },
    })
    expect(mocks.queryRequirementList.mock.calls[0]?.[1]).not.toHaveProperty(
      'requirementIds',
    )
  })

  it('returns an empty list when an explicitly applied selection has no published matches', async () => {
    mocks.getRequirementSelectionFilterForSpecification.mockResolvedValue({
      hasCurrentAnswers: true,
      hasRequirementSelection: true,
      hasNoRequirementSelection: false,
      requirementIds: [],
    })

    const response = await GET(
      new NextRequest(
        'http://localhost/api/requirements-specifications/IAM-INFOR-2026/available-requirements?applyRequirementSelectionFilter=true&limit=15',
      ),
      makeParams('IAM-INFOR-2026'),
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      pagination: {
        count: 0,
        hasMore: false,
        limit: 15,
        nextOffset: null,
        offset: 0,
        total: 0,
      },
      requirements: [],
      selectionFilter: {
        applied: true,
        hasCurrentAnswers: true,
        hasRequirementSelection: true,
        hasNoRequirementSelection: false,
        requirementIds: [],
      },
    })
    expect(mocks.queryRequirementList).not.toHaveBeenCalled()
  })

  it('rejects needs-reference filters because the available list does not use them', async () => {
    const response = await GET(
      new NextRequest(
        'http://localhost/api/requirements-specifications/IAM-INFOR-2026/available-requirements?needsReferenceIds=1',
      ),
      makeParams('IAM-INFOR-2026'),
    )

    expect(response.status).toBe(400)
    expect(mocks.createRequirementsRestRuntime).not.toHaveBeenCalled()
    expect(mocks.queryRequirementList).not.toHaveBeenCalled()
  })

  it('logs internal failures before returning the safe HTTP error', async () => {
    const error = new Error(
      "Invalid object name 'specification_requirement_selection_answers'.",
    )
    mocks.queryRequirementList.mockRejectedValue(error)

    const response = await GET(
      new NextRequest(
        'http://localhost/api/requirements-specifications/IAM-INFOR-2026/available-requirements?limit=15&locale=sv',
      ),
      makeParams('IAM-INFOR-2026'),
    )

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({
      code: 'internal',
      error: 'An internal error occurred',
    })
    expect(mocks.logSanitizedError).toHaveBeenCalledWith(
      '[API] Failed to list available requirements for specification',
      error,
      { specificationIdOrSlug: 'IAM-INFOR-2026' },
    )
  })
})
