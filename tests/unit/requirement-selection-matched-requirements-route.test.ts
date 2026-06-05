import { beforeEach, describe, expect, it, vi } from 'vitest'

const routeState = vi.hoisted(() => ({
  db: {},
  listMatchedRequirements: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  getRequestSqlServerDataSource: vi.fn(() => routeState.db),
}))

vi.mock('@/lib/dal/requirement-selection-questions', () => ({
  listRequirementSelectionMatchedRequirements:
    routeState.listMatchedRequirements,
}))

describe('requirement selection matched requirements route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns matched requirements for mixed package and requirement filters', async () => {
    routeState.listMatchedRequirements.mockResolvedValue([
      {
        description: 'Matched requirement',
        direct: true,
        id: 11,
        sourcePackages: [{ id: 2, name: 'Baseline' }],
        uniqueId: 'REQ-011',
      },
    ])

    const { GET } = await import(
      '@/app/api/requirement-selection-questions/matched-requirements/route'
    )
    const response = await GET(
      new Request(
        'http://localhost/api/requirement-selection-questions/matched-requirements?packageIds=2&requirementIds=11',
      ),
    )

    await expect(response.json()).resolves.toEqual({
      requirements: [
        {
          description: 'Matched requirement',
          direct: true,
          id: 11,
          sourcePackages: [{ id: 2, name: 'Baseline' }],
          uniqueId: 'REQ-011',
        },
      ],
    })
    expect(routeState.listMatchedRequirements).toHaveBeenCalledWith(
      routeState.db,
      {
        packageIds: [2],
        requirementIds: [11],
      },
    )
  })

  it('passes duplicate query ids through for DAL-level deduplication', async () => {
    routeState.listMatchedRequirements.mockResolvedValue([])

    const { GET } = await import(
      '@/app/api/requirement-selection-questions/matched-requirements/route'
    )
    await GET(
      new Request(
        'http://localhost/api/requirement-selection-questions/matched-requirements?packageIds=2&packageIds=2&requirementIds=11&requirementIds=11',
      ),
    )

    expect(routeState.listMatchedRequirements).toHaveBeenCalledWith(
      routeState.db,
      {
        packageIds: [2, 2],
        requirementIds: [11, 11],
      },
    )
  })

  it('returns 400 for invalid ids before querying', async () => {
    const { GET } = await import(
      '@/app/api/requirement-selection-questions/matched-requirements/route'
    )
    const response = await GET(
      new Request(
        'http://localhost/api/requirement-selection-questions/matched-requirements?packageIds=0',
      ),
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      error: 'Invalid request',
    })
    expect(routeState.listMatchedRequirements).not.toHaveBeenCalled()
  })
})
