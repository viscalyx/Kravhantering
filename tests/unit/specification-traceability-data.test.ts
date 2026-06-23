import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SqlServerDatabase } from '@/lib/db'
import { collectSpecificationTraceabilityData } from '@/lib/reports/data/specification-traceability'

const dalState = vi.hoisted(() => ({
  getSpecificationById: vi.fn(),
  getSpecificationBySlug: vi.fn(),
  listSpecificationTraceabilityItems: vi.fn(),
}))

vi.mock('@/lib/dal/requirements-specifications', () => ({
  getSpecificationById: dalState.getSpecificationById,
  getSpecificationBySlug: dalState.getSpecificationBySlug,
  listSpecificationTraceabilityItems:
    dalState.listSpecificationTraceabilityItems,
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
    uniqueId: 'SPEC-1',
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
    dalState.getSpecificationBySlug.mockResolvedValue(specification())
    dalState.getSpecificationById.mockResolvedValue(specification())
    dalState.listSpecificationTraceabilityItems.mockResolvedValue([
      { itemRef: 'lib:31', uniqueId: 'BEH0001' },
      { itemRef: 'local:41', uniqueId: 'KRAV0001' },
    ])
  })

  it('resolves the specification and preserves requested item order', async () => {
    const db = createDb()

    const result = await collectSpecificationTraceabilityData(db, 'SPEC-1', [
      'local:41',
      'lib:31',
    ])

    expect(dalState.getSpecificationBySlug).toHaveBeenCalledWith(db, 'SPEC-1')
    expect(dalState.listSpecificationTraceabilityItems).toHaveBeenCalledWith(
      db,
      10,
      ['local:41', 'lib:31'],
    )
    expect(result.items.map(item => item.itemRef)).toEqual([
      'local:41',
      'lib:31',
    ])
    expect(result.specification.uniqueId).toBe('SPEC-1')
  })

  it('uses a pre-resolved specification without resolving it again', async () => {
    const db = createDb()
    const resolvedSpecification = specification()
    dalState.listSpecificationTraceabilityItems.mockResolvedValueOnce([
      { itemRef: 'lib:31', uniqueId: 'BEH0001' },
    ])

    const result = await collectSpecificationTraceabilityData(
      db,
      resolvedSpecification,
      ['lib:31'],
    )

    expect(dalState.getSpecificationById).not.toHaveBeenCalled()
    expect(dalState.getSpecificationBySlug).not.toHaveBeenCalled()
    expect(dalState.listSpecificationTraceabilityItems).toHaveBeenCalledWith(
      db,
      10,
      ['lib:31'],
    )
    expect(result.specification).toBe(resolvedSpecification)
  })

  it('throws 404 when a requested item ref is not in the specification', async () => {
    const db = createDb()
    dalState.listSpecificationTraceabilityItems.mockResolvedValueOnce([
      { itemRef: 'lib:31', uniqueId: 'BEH0001' },
    ])

    await expect(
      collectSpecificationTraceabilityData(db, 'SPEC-1', [
        'lib:31',
        'local:41',
      ]),
    ).rejects.toMatchObject({
      message: 'One or more item refs were not found in this specification',
      status: 404,
    })
  })

  it('resolves numeric specification identifiers by id', async () => {
    const db = createDb()

    await collectSpecificationTraceabilityData(db, '10', ['lib:31', 'local:41'])

    expect(dalState.getSpecificationById).toHaveBeenCalledWith(db, 10)
  })
})
