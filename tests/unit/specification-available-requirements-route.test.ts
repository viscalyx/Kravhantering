import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { forbiddenError } from '@/lib/requirements/errors'

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

const mocks = vi.hoisted(() => ({
  createRequirementsRestRuntime: vi.fn(),
  getAvailableSpecificationRequirements: vi.fn(),
  getSpecificationById: vi.fn(),
  logSanitizedError: vi.fn(),
}))

vi.mock('@/lib/dal/requirements-specifications', () => ({
  getSpecificationById: mocks.getSpecificationById,
}))

vi.mock('@/lib/http/safe-errors', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/http/safe-errors')>()
  return { ...actual, logSanitizedError: mocks.logSanitizedError }
})

vi.mock('@/lib/requirements/server', () => ({
  createRequirementsRestRuntime: mocks.createRequirementsRestRuntime,
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
      service: {
        getAvailableSpecificationRequirements:
          mocks.getAvailableSpecificationRequirements,
      },
    })
    mocks.getSpecificationById.mockResolvedValue({ id: 6 })
    mocks.getAvailableSpecificationRequirements.mockResolvedValue({
      pagination: {
        count: 1,
        hasMore: false,
        limit: 25,
        nextCursor: null,
      },
      requirements: [{ id: 201, uniqueId: 'IAM0201' }],
      selectionFilter: {
        applied: false,
        hasCurrentAnswers: true,
        hasRequirementSelection: true,
        hasNoRequirementSelection: false,
        requirementIds: [201],
      },
    })
  })

  it('rejects status query params because available requirements are always published-only', async () => {
    const response = await GET(
      new NextRequest(
        'http://localhost/api/requirements-specifications/6/available-requirements?statuses=3',
      ),
      makeParams('6'),
    )

    expect(response.status).toBe(400)
    expect(mocks.createRequirementsRestRuntime).not.toHaveBeenCalled()
    expect(mocks.getAvailableSpecificationRequirements).not.toHaveBeenCalled()
  })

  it('returns the shared domain page for supported refresh filters', async () => {
    const response = await GET(
      new NextRequest(
        'http://localhost/api/requirements-specifications/6/available-requirements?areaIds=1&categoryIds=2&descriptionSearch=access&limit=25&locale=sv&normReferenceIds=3&cursor=next&qualityCharacteristicIds=4&requirementPackageIds=5&verifiable=true&priorityLevelIds=6&sortBy=description&sortDirection=desc&typeIds=7&uniqueIdSearch=IAM',
      ),
      makeParams('6'),
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({
      pagination: {
        count: 1,
        hasMore: false,
        limit: 25,
        nextCursor: null,
      },
      requirements: [{ id: 201, uniqueId: 'IAM0201' }],
      selectionFilter: {
        applied: false,
        hasCurrentAnswers: true,
        hasRequirementSelection: true,
        hasNoRequirementSelection: false,
        requirementIds: [201],
      },
    })
    expect(mocks.getAvailableSpecificationRequirements).toHaveBeenCalledWith(
      mockContext,
      {
        applyRequirementSelectionFilter: false,
        capacitySurface: 'rest',
        cursor: 'next',
        filters: {
          areaIds: [1],
          categoryIds: [2],
          descriptionSearch: 'access',
          normReferenceIds: [3],
          priorityLevelIds: [6],
          qualityCharacteristicIds: [4],
          requirementPackageIds: [5],
          typeIds: [7],
          uniqueIdSearch: 'IAM',
          verifiable: ['true'],
        },
        limit: 25,
        locale: 'sv',
        sort: { by: 'description', direction: 'desc' },
        specificationId: 6,
      },
    )
  })

  it('applies requirement-selection filtering only as an explicit opt-in', async () => {
    mocks.getAvailableSpecificationRequirements.mockImplementationOnce(
      async (_context, input) => ({
        pagination: {
          count: 1,
          hasMore: false,
          limit: 25,
          nextCursor: null,
        },
        requirements: [{ id: 201, uniqueId: 'IAM0201' }],
        selectionFilter: {
          applied: input.applyRequirementSelectionFilter,
          hasCurrentAnswers: true,
          hasRequirementSelection: true,
          hasNoRequirementSelection: false,
          requirementIds: [201],
        },
      }),
    )

    const response = await GET(
      new NextRequest(
        'http://localhost/api/requirements-specifications/6/available-requirements?applyRequirementSelectionFilter=true',
      ),
      makeParams('6'),
    )

    await expect(response.json()).resolves.toMatchObject({
      selectionFilter: { applied: true },
    })
  })

  it('rejects unsupported needs-reference filters at the adapter boundary', async () => {
    const response = await GET(
      new NextRequest(
        'http://localhost/api/requirements-specifications/6/available-requirements?needsReferenceIds=1',
      ),
      makeParams('6'),
    )

    expect(response.status).toBe(400)
    expect(mocks.createRequirementsRestRuntime).not.toHaveBeenCalled()
  })

  it('rejects invalid or missing specification scopes before listing', async () => {
    const invalid = await GET(
      new NextRequest(
        'http://localhost/api/requirements-specifications/nope/available-requirements',
      ),
      makeParams('nope'),
    )
    mocks.getSpecificationById.mockResolvedValueOnce(null)
    const missing = await GET(
      new NextRequest(
        'http://localhost/api/requirements-specifications/404/available-requirements',
      ),
      makeParams('404'),
    )

    expect(invalid.status).toBe(400)
    expect(missing.status).toBe(404)
    expect(mocks.getAvailableSpecificationRequirements).not.toHaveBeenCalled()
  })

  it('logs internal shared-read failures before returning the safe HTTP error', async () => {
    const error = new Error("Invalid object name 'requirement_versions'.")
    mocks.getAvailableSpecificationRequirements.mockRejectedValueOnce(error)

    const response = await GET(
      new NextRequest(
        'http://localhost/api/requirements-specifications/6/available-requirements',
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

  it('does not log expected assignment failures from the shared read', async () => {
    mocks.getAvailableSpecificationRequirements.mockRejectedValueOnce(
      forbiddenError('Specification read denied'),
    )

    const response = await GET(
      new NextRequest(
        'http://localhost/api/requirements-specifications/6/available-requirements',
      ),
      makeParams('6'),
    )

    expect(response.status).toBe(403)
    expect(mocks.logSanitizedError).not.toHaveBeenCalled()
  })
})
