import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RequirementReportData } from '@/lib/reports/data/fetch-requirement'

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
  getRequirementById: vi.fn(),
  getSpecificationById: vi.fn(),
  getSpecificationBySlug: vi.fn(),
  getSpecificationItemById: vi.fn(),
  getSpecificationLocalRequirementDetail: vi.fn(),
}

vi.mock('@/lib/db', () => ({
  getRequestSqlServerDataSource: () => mockDb,
}))

vi.mock('@/lib/dal/requirements', () => ({
  getRequirementById: (...args: unknown[]) => mocks.getRequirementById(...args),
}))

vi.mock('@/lib/dal/requirements-specifications', async importOriginal => {
  const actual =
    await importOriginal<
      typeof import('@/lib/dal/requirements-specifications')
    >()
  return {
    ...actual,
    getSpecificationById: (...args: unknown[]) =>
      mocks.getSpecificationById(...args),
    getSpecificationBySlug: (...args: unknown[]) =>
      mocks.getSpecificationBySlug(...args),
    getSpecificationItemById: (...args: unknown[]) =>
      mocks.getSpecificationItemById(...args),
    getSpecificationLocalRequirementDetail: (...args: unknown[]) =>
      mocks.getSpecificationLocalRequirementDetail(...args),
  }
})

vi.mock('@/lib/observability/capacity', () => ({
  observeCapacity: async (
    _options: unknown,
    operation: () => Promise<Response>,
  ) => operation(),
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

import { GET } from '@/app/api/requirements-specifications/[id]/report-items/route'

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) }
}

function makeVersion(
  overrides: Partial<RequirementReportData['versions'][number]> = {},
): RequirementReportData['versions'][number] {
  return {
    acceptanceCriteria: 'Verify the operating routine.',
    archiveInitiatedAt: null,
    archivedAt: null,
    category: null,
    createdAt: '2026-05-01T00:00:00.000Z',
    createdBy: null,
    description: 'The service must be monitored.',
    editedAt: null,
    id: 301,
    publishedAt: '2026-05-02T00:00:00.000Z',
    qualityCharacteristic: null,
    requiresTesting: true,
    riskLevel: null,
    status: 3,
    statusColor: '#22c55e',
    statusIconName: 'CheckCircle2',
    statusNameEn: 'Published',
    statusNameSv: 'Publicerad',
    type: null,
    verificationMethod: 'Inspection',
    versionNormReferences: [],
    versionNumber: 1,
    versionRequirementPackages: [],
    ...overrides,
  }
}

describe('requirements-specifications/[id]/report-items route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getSpecificationBySlug.mockResolvedValue({ id: 7 })
  })

  it('returns mixed library and specification-local report rows by item ref', async () => {
    const libraryRequirement: RequirementReportData = {
      area: {
        id: 2,
        name: 'Operations',
        ownerHsaId: 'SE5560000001-ops1',
        ownerName: 'Ignored Owner',
      },
      createdAt: '2026-05-01T00:00:00.000Z',
      id: 301,
      isArchived: false,
      uniqueId: 'DRIFT0038',
      versions: [makeVersion()],
    }
    mocks.getSpecificationItemById.mockResolvedValue({
      id: 31,
      requirementId: 301,
      specificationId: 7,
    })
    mocks.getRequirementById.mockResolvedValue(libraryRequirement)
    mocks.getSpecificationLocalRequirementDetail.mockResolvedValue({
      acceptanceCriteria: 'Unique acceptance criteria',
      createdAt: '2026-05-03T00:00:00.000Z',
      description: 'Unique requirement in this specification',
      id: 41,
      normReferences: [
        {
          id: 11,
          name: 'Local policy',
          normReferenceId: 'POL-1',
          uri: 'https://example.test/policy',
        },
      ],
      qualityCharacteristic: {
        id: 3,
        nameEn: 'Reliability',
        nameSv: 'Tillförlitlighet',
      },
      requirementCategory: { id: 4, nameEn: 'IT', nameSv: 'IT' },
      requirementPackages: [{ id: 9, name: 'Drift' }],
      requirementType: { id: 5, nameEn: 'Functional', nameSv: 'Funktionellt' },
      requiresTesting: true,
      riskLevel: {
        color: '#f59e0b',
        iconName: 'AlertTriangle',
        id: 6,
        nameEn: 'Medium',
        nameSv: 'Medel',
        sortOrder: 2,
      },
      uniqueId: 'KRAV0041',
      updatedAt: '2026-05-04T00:00:00.000Z',
      verificationMethod: 'Demonstration',
    })

    const response = await GET(
      new NextRequest(
        'http://localhost/api/requirements-specifications/DRIFT-FORV-BAS/report-items?refs=lib%3A31,local%3A41',
      ),
      makeParams('DRIFT-FORV-BAS'),
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual([
      {
        ...libraryRequirement,
        area: {
          id: 2,
          name: 'Operations',
          ownerHsaId: 'SE5560000001-ops1',
          ownerName: null,
        },
      },
      expect.objectContaining({
        area: null,
        id: 41,
        isArchived: false,
        uniqueId: 'KRAV0041',
        versions: [
          expect.objectContaining({
            description: 'Unique requirement in this specification',
            statusNameSv: 'Publicerad',
            versionNormReferences: [
              {
                normReference: {
                  id: 11,
                  name: 'Local policy',
                  normReferenceId: 'POL-1',
                  reference: 'POL-1',
                  uri: 'https://example.test/policy',
                },
              },
            ],
            versionRequirementPackages: [
              {
                requirementPackage: {
                  id: 9,
                  name: 'Drift',
                },
              },
            ],
          }),
        ],
      }),
    ])
    expect(mocks.getSpecificationBySlug).toHaveBeenCalledWith(
      mockDb,
      'DRIFT-FORV-BAS',
    )
    expect(mocks.getSpecificationItemById).toHaveBeenCalledWith(mockDb, 31)
    expect(mocks.getRequirementById).toHaveBeenCalledWith(mockDb, 301)
    expect(mocks.getSpecificationLocalRequirementDetail).toHaveBeenCalledWith(
      mockDb,
      7,
      41,
    )
  })

  it('accepts more than 50 report item refs', async () => {
    const itemRefs = Array.from(
      { length: 60 },
      (_, index) => `lib:${index + 1}`,
    )
    mocks.getSpecificationItemById.mockImplementation(
      async (_db: unknown, id: number) => ({
        id,
        requirementId: id + 1000,
        specificationId: 7,
      }),
    )
    mocks.getRequirementById.mockImplementation(
      async (_db: unknown, id: number): Promise<RequirementReportData> => ({
        area: null,
        createdAt: '2026-05-01T00:00:00.000Z',
        id,
        isArchived: false,
        uniqueId: `DRIFT${String(id).padStart(4, '0')}`,
        versions: [makeVersion({ id })],
      }),
    )

    const response = await GET(
      new NextRequest(
        `http://localhost/api/requirements-specifications/DRIFT-FORV-BAS/report-items?refs=${itemRefs
          .map(ref => encodeURIComponent(ref))
          .join(',')}`,
      ),
      makeParams('DRIFT-FORV-BAS'),
    )
    const body = (await response.json()) as RequirementReportData[]

    expect(response.status).toBe(200)
    expect(body).toHaveLength(60)
    expect(body.map(row => row.uniqueId)).toEqual(
      itemRefs.map(
        (_ref, index) => `DRIFT${String(index + 1001).padStart(4, '0')}`,
      ),
    )
    expect(mocks.getSpecificationItemById).toHaveBeenCalledTimes(60)
    expect(mocks.getRequirementById).toHaveBeenCalledTimes(60)
  })
})
