import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createRequestContext: vi.fn(),
  getRequestSqlServerDataSource: vi.fn(),
  listAreaIdsActorCanAuthor: vi.fn(),
  listRequirementAreaStewardshipRows: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  getRequestSqlServerDataSource: mocks.getRequestSqlServerDataSource,
}))

vi.mock('@/lib/requirements/auth', () => ({
  createRequestContext: mocks.createRequestContext,
}))

vi.mock('@/lib/dal/requirement-areas', () => ({
  listAreaIdsActorCanAuthor: mocks.listAreaIdsActorCanAuthor,
  listRequirementAreaStewardshipRows: mocks.listRequirementAreaStewardshipRows,
}))

import { GET } from '@/app/api/requirement-area-stewardship/route'

describe('requirement area stewardship route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getRequestSqlServerDataSource.mockResolvedValue({ query: vi.fn() })
    mocks.createRequestContext.mockResolvedValue({
      actor: {
        hsaId: 'SE5560000001-reader1',
        roles: [],
      },
    })
    mocks.listAreaIdsActorCanAuthor.mockResolvedValue([])
    mocks.listRequirementAreaStewardshipRows.mockResolvedValue([
      {
        coAuthors: [
          {
            displayName: 'Cora CoAuthor',
            hsaId: 'SE5560000001-areaco1',
          },
        ],
        description: 'Area description',
        id: 7,
        name: 'Area name',
        ownerDisplayName: 'Olle AreaOwner',
        ownerHsaId: 'SE5560000001-areaowner1',
        prefix: 'AREA',
      },
    ])
  })

  it('returns responsibility summaries to every authenticated list reader while keeping assignment actions restricted', async () => {
    const response = await GET(
      new Request('http://localhost/api/requirement-area-stewardship'),
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      areas: [
        expect.objectContaining({
          coAuthors: [
            {
              displayName: 'Cora CoAuthor',
              hsaId: 'SE5560000001-areaco1',
            },
          ],
          ownerDisplayName: 'Olle AreaOwner',
          ownerHsaId: 'SE5560000001-areaowner1',
          permissions: {
            canAuthor: false,
            canManageAssignments: false,
          },
        }),
      ],
    })
  })

  it('grants administrators every list permission without loading authored area ids', async () => {
    mocks.createRequestContext.mockResolvedValueOnce({
      actor: {
        hsaId: 'SE5560000001-admin1',
        roles: ['Admin'],
      },
    })

    const response = await GET(
      new Request('http://localhost/api/requirement-area-stewardship'),
    )

    await expect(response.json()).resolves.toMatchObject({
      areas: [
        {
          permissions: {
            canAuthor: true,
            canManageAssignments: true,
          },
        },
      ],
    })
    expect(mocks.listAreaIdsActorCanAuthor).not.toHaveBeenCalled()
  })
})
