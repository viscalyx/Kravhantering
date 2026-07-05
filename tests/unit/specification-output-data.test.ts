import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SqlServerDatabase } from '@/lib/db'
import { collectSpecificationOutputData } from '@/lib/reports/data/specification-output'

const dalState = vi.hoisted(() => ({
  countDeviationsPerItemRef: vi.fn(),
  getSpecificationById: vi.fn(),
  parseSpecificationItemRef: vi.fn(),
}))

vi.mock('@/lib/dal/deviations', () => ({
  countDeviationsPerItemRef: dalState.countDeviationsPerItemRef,
}))

vi.mock('@/lib/dal/requirements-specifications', () => ({
  createLibraryItemRef: (id: number) => `lib:${id}`,
  createSpecificationLocalItemRef: (id: number) => `local:${id}`,
  getSpecificationById: dalState.getSpecificationById,
  parseSpecificationItemRef: dalState.parseSpecificationItemRef,
}))

function specification() {
  return {
    businessNeedsReference: 'IAM initiative',
    createdAt: '2026-06-01T00:00:00.000Z',
    governanceObjectType: null,
    id: 10,
    implementationType: null,
    lifecycleStatus: null,
    name: 'IAM',
    responsibleDisplayName: 'Ada Admin',
    responsibleHsaId: 'SE5560000001-ada1',
    specificationGovernanceObjectTypeId: null,
    specificationImplementationTypeId: null,
    specificationLifecycleStatusId: 3,
    specificationCode: 'SPEC-1',
    updatedAt: '2026-06-02T00:00:00.000Z',
  }
}

function createDb() {
  const queries: string[] = []
  const db = {
    query: vi.fn(async (sql: string) => {
      queries.push(sql)

      if (sql.includes('requirement_version_norm_references')) {
        return [
          {
            id: 7,
            itemId: 31,
            name: 'ISO 27001',
            normReferenceId: 'ISO27001',
            uri: 'https://example.test/iso',
          },
        ]
      }

      if (sql.includes('specification_local_requirement_norm_references')) {
        return [
          {
            id: 8,
            itemId: 41,
            name: 'Local norm',
            normReferenceId: 'LOCAL',
            uri: null,
          },
        ]
      }

      if (sql.includes('requirement_version_requirement_packages')) {
        return [{ itemId: 31, name: 'Base package' }]
      }

      if (sql.includes('improvement_suggestions')) {
        return [{ count: 3, itemId: 31 }]
      }

      if (
        sql.includes('FROM requirements_specification_items specification_item')
      ) {
        return [
          {
            areaName: 'Security',
            categoryNameEn: 'Business',
            categoryNameSv: 'Verksamhet',
            description: 'Pinned library version',
            itemId: 31,
            qualityCharacteristicChapterId: '3.6',
            qualityCharacteristicNameEn: 'Security',
            qualityCharacteristicNameSv: 'Informationssäkerhet',
            verifiable: 1,
            priorityLevelNameEn: 'High',
            priorityLevelNameSv: 'Hög',
            specificationItemStatusId: 2,
            specificationItemStatusNameEn: 'In progress',
            specificationItemStatusNameSv: 'Pågår',
            statusNameEn: 'Published',
            statusNameSv: 'Publicerad',
            typeNameEn: 'Non-functional',
            typeNameSv: 'Icke-funktionellt',
            uniqueId: 'B-2',
            versionNumber: 4,
          },
        ]
      }

      if (
        sql.includes('FROM specification_local_requirements local_requirement')
      ) {
        return [
          {
            categoryNameEn: 'IT',
            categoryNameSv: 'IT',
            description: 'Local requirement',
            itemId: 41,
            qualityCharacteristicChapterId: null,
            qualityCharacteristicNameEn: null,
            qualityCharacteristicNameSv: null,
            verifiable: 0,
            priorityLevelNameEn: null,
            priorityLevelNameSv: null,
            specificationItemStatusId: 1,
            specificationItemStatusNameEn: 'Included',
            specificationItemStatusNameSv: 'Inkluderad',
            typeNameEn: 'Functional',
            typeNameSv: 'Funktionellt',
            uniqueId: 'A-1',
          },
        ]
      }

      return []
    }),
  } as Partial<SqlServerDatabase> as SqlServerDatabase

  return { db, queries }
}

describe('collectSpecificationOutputData', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dalState.getSpecificationById.mockResolvedValue(specification())
    dalState.countDeviationsPerItemRef.mockResolvedValue(
      new Map([
        ['lib:31', { approved: 1, pending: 0, rejected: 0, total: 1 }],
        ['local:41', { approved: 0, pending: 1, rejected: 0, total: 1 }],
      ]),
    )
  })

  it('uses the requirement version pinned by the specification item', async () => {
    const { db, queries } = createDb()

    const result = await collectSpecificationOutputData(db, 10)

    expect(result.items.map(item => item.uniqueId)).toEqual(['A-1', 'B-2'])
    expect(result.items[0]).toMatchObject({
      requirementPackageNames: [],
    })
    expect(result.items[1]).toMatchObject({
      deviationCounts: { approved: 1 },
      requirementPackageNames: ['Base package'],
      suggestionCount: 3,
      versionNumber: 4,
    })
    expect(result.items[1]?.normReferences).toEqual([
      expect.objectContaining({
        normReferenceId: 'ISO27001',
        uri: 'https://example.test/iso',
      }),
    ])
    expect(
      queries.some(query =>
        query.includes(
          'requirement_version.id = specification_item.requirement_version_id',
        ),
      ),
    ).toBe(true)
    expect(
      queries.some(query =>
        query.includes('specification_local_requirement_requirement_packages'),
      ),
    ).toBe(false)
  })
})
