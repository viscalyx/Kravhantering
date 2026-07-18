import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SqlServerDatabase } from '@/lib/db'
import { collectSpecificationTraceabilityData } from '@/lib/reports/data/specification-traceability'

const dalState = vi.hoisted(() => ({
  getSpecificationById: vi.fn(),
  listSpecificationTraceabilityItems: vi.fn(),
  traverseCompleteSpecificationItemResult: vi.fn(),
}))

vi.mock('@/lib/dal/requirements-specifications', () => ({
  getSpecificationById: dalState.getSpecificationById,
  listSpecificationTraceabilityItems:
    dalState.listSpecificationTraceabilityItems,
}))

vi.mock('@/lib/requirements/specification-item-page', () => ({
  traverseCompleteSpecificationItemResult:
    dalState.traverseCompleteSpecificationItemResult,
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
  return {
    query: vi.fn(),
  } as Partial<SqlServerDatabase> as SqlServerDatabase
}

describe('collectSpecificationTraceabilityData', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dalState.getSpecificationById.mockResolvedValue(specification())
    dalState.traverseCompleteSpecificationItemResult.mockImplementation(
      async (_db, _input, visitPage) => {
        await visitPage([{ itemRef: 'local:41' }, { itemRef: 'lib:31' }], 1)
        return { itemCount: 2, pageCount: 1 }
      },
    )
    dalState.listSpecificationTraceabilityItems.mockImplementation(
      async (_db, _specificationId, itemRefs: string[]) =>
        itemRefs.map(itemRef => ({
          itemRef,
          uniqueId: itemRef === 'lib:31' ? 'BEH0001' : 'KRAV0001',
        })),
    )
  })

  it('resolves the specification and preserves database page order', async () => {
    const db = createDb()

    const result = await collectSpecificationTraceabilityData(db, 10, {
      descriptionSearch: ' access ',
      locale: 'sv',
      sortBy: 'priorityLevel',
      sortDirection: 'desc',
    })

    expect(dalState.getSpecificationById).toHaveBeenCalledWith(db, 10)
    expect(
      dalState.traverseCompleteSpecificationItemResult,
    ).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        filters: expect.objectContaining({ descriptionSearch: ' access ' }),
        locale: 'sv',
        sort: { by: 'priorityLevel', direction: 'desc' },
        specificationId: 10,
      }),
      expect.any(Function),
    )
    expect(dalState.listSpecificationTraceabilityItems).toHaveBeenCalledWith(
      db,
      10,
      ['local:41', 'lib:31'],
    )
    expect(result.items.map(item => item.itemRef)).toEqual([
      'local:41',
      'lib:31',
    ])
    expect(result.specification.specificationCode).toBe('SPEC-1')
  })

  it('uses a pre-resolved specification without resolving it again', async () => {
    const db = createDb()
    const resolvedSpecification = specification()

    const result = await collectSpecificationTraceabilityData(
      db,
      resolvedSpecification,
      { locale: 'en' },
    )

    expect(dalState.getSpecificationById).not.toHaveBeenCalled()
    expect(dalState.listSpecificationTraceabilityItems).toHaveBeenCalledWith(
      db,
      10,
      ['local:41', 'lib:31'],
    )
    expect(result.specification).toBe(resolvedSpecification)
  })

  it('throws 409 when an item changes during bounded traversal', async () => {
    const db = createDb()
    dalState.listSpecificationTraceabilityItems.mockResolvedValueOnce([
      { itemRef: 'lib:31', uniqueId: 'BEH0001' },
    ])

    await expect(
      collectSpecificationTraceabilityData(db, 10, { locale: 'en' }),
    ).rejects.toMatchObject({
      message:
        'A requirement application changed while the report was generated',
      status: 409,
    })
  })

  it('loads more than the former reference limit in bounded pages', async () => {
    const db = createDb()
    const firstPage = Array.from({ length: 100 }, (_, index) => ({
      itemRef: `lib:${index + 1}`,
    }))
    const secondPage = [{ itemRef: 'local:101' }]
    dalState.traverseCompleteSpecificationItemResult.mockImplementationOnce(
      async (_db, _input, visitPage) => {
        await visitPage(firstPage, 1)
        await visitPage(secondPage, 2)
        return { itemCount: 101, pageCount: 2 }
      },
    )

    const result = await collectSpecificationTraceabilityData(db, 10, {
      locale: 'en',
    })

    expect(result.items).toHaveLength(101)
    expect(dalState.listSpecificationTraceabilityItems).toHaveBeenCalledTimes(2)
    expect(
      dalState.listSpecificationTraceabilityItems.mock.calls[0]?.[2],
    ).toHaveLength(100)
  })
})
