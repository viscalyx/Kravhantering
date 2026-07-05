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
  getSpecificationById: vi.fn(),
  getRequirementSelectionFilterForSpecification: vi.fn(),
  logSanitizedError: vi.fn(),
  queryRequirementList: vi.fn(),
}

vi.mock('@/lib/dal/requirement-selection-questions', () => ({
  getExistingSpecificationRequirementIds: (...args: unknown[]) =>
    mocks.getExistingSpecificationRequirementIds(...args),
  getRequirementSelectionFilterForSpecification: (...args: unknown[]) =>
    mocks.getRequirementSelectionFilterForSpecification(...args),
}))

vi.mock('@/lib/dal/requirements-specifications', () => ({
  getSpecificationById: (...args: unknown[]) =>
    mocks.getSpecificationById(...args),
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
    mocks.getSpecificationById.mockResolvedValue({ id: 6 })
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
  })

  it('rejects status query params because available requirements are always published-only', async () => {
    const response = await GET(
      new NextRequest(
        'http://localhost/api/requirements-specifications/6/available-requirements?limit=15&locale=sv&sortBy=uniqueId&sortDirection=asc&statuses=3',
      ),
      makeParams('6'),
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      error: 'Invalid request',
      issues: [
        {
          code: 'unrecognized_keys',
          path: '$',
        },
      ],
    })
    expect(mocks.createRequirementsRestRuntime).not.toHaveBeenCalled()
    expect(mocks.queryRequirementList).not.toHaveBeenCalled()
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
        'http://localhost/api/requirements-specifications/6/available-requirements?applyRequirementSelectionFilter=true',
      ),
      makeParams('6'),
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
        'http://localhost/api/requirements-specifications/6/available-requirements',
      ),
      makeParams('6'),
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
        'http://localhost/api/requirements-specifications/6/available-requirements?applyRequirementSelectionFilter=true&limit=15',
      ),
      makeParams('6'),
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
        'http://localhost/api/requirements-specifications/6/available-requirements?needsReferenceIds=1',
      ),
      makeParams('6'),
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
        'http://localhost/api/requirements-specifications/6/available-requirements?limit=15&locale=sv',
      ),
      makeParams('6'),
    )

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({
      code: 'internal',
      error: 'An internal error occurred',
    })
    expect(mocks.logSanitizedError).toHaveBeenCalledWith(
      '[API] Failed to list available requirements for specification',
      error,
      { specificationId: 6 },
    )
  })
})
