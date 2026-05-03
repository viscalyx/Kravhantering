import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  countLinkedSpecificationItems,
  getLinkedSpecificationItems,
} from '@/lib/dal/specification-item-statuses'

function createSqlServerDb() {
  const query =
    vi.fn<(sql: string, parameters?: unknown[]) => Promise<unknown[]>>()
  const db = { query } as unknown as Parameters<
    typeof countLinkedSpecificationItems
  >[0]

  return { db, query }
}

describe('specification item statuses DAL', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('counts linked library and specification-local items by status', async () => {
    const { db, query } = createSqlServerDb()
    query.mockResolvedValueOnce([
      { count: 3, statusId: 1 },
      { count: 2, statusId: 5 },
    ])

    await expect(countLinkedSpecificationItems(db)).resolves.toEqual({
      1: 3,
      5: 2,
    })

    const [sql] = query.mock.calls[0]
    expect(sql).toContain('FROM requirements_specification_items')
    expect(sql).toContain('FROM specification_local_requirements')
    expect(sql).toContain('UNION ALL')
  })

  it('lists linked specifications across library and local requirement rows', async () => {
    const { db, query } = createSqlServerDb()
    query.mockResolvedValueOnce([
      {
        requirementCount: 4,
        specificationId: 7,
        specificationName: 'IAM specification',
      },
    ])

    await expect(getLinkedSpecificationItems(db, 2)).resolves.toEqual([
      {
        requirementCount: 4,
        specificationId: 7,
        specificationName: 'IAM specification',
      },
    ])

    const [sql, params] = query.mock.calls[0]
    expect(sql).toContain(
      'requirements_specification_items.requirements_specification_id',
    )
    expect(sql).toContain('specification_local_requirements.specification_id')
    expect(params).toEqual([2])
  })
})
