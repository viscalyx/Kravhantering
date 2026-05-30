import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  countLinkedSpecificationItems,
  getLinkedSpecificationItems,
  getSpecificationItemStatusById,
  listSpecificationItemStatuses,
  updateSpecificationItemStatus,
} from '@/lib/dal/specification-item-statuses'

function createSqlServerDb() {
  const query =
    vi.fn<(sql: string, parameters?: unknown[]) => Promise<unknown[]>>()
  const repository = {
    find: vi.fn(),
    findOne: vi.fn(),
    update: vi.fn(),
  }
  const db = {
    getRepository: vi.fn(() => repository),
    query,
  } as unknown as Parameters<typeof countLinkedSpecificationItems>[0]

  return { db, query, repository }
}

const statusEntity = (id: number) => ({
  color: '#94a3b8',
  descriptionEn: null,
  descriptionSv: null,
  iconName: null,
  id,
  nameEn: id === 1 ? 'Included' : 'Custom',
  nameSv: id === 1 ? 'Inkluderad' : 'Anpassad',
  sortOrder: id,
})

describe('usage statuses DAL', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('lists only seeded system usage statuses', async () => {
    const { db, repository } = createSqlServerDb()
    repository.find.mockResolvedValueOnce([statusEntity(1), statusEntity(7)])

    await expect(listSpecificationItemStatuses(db)).resolves.toEqual([
      {
        color: '#94a3b8',
        descriptionEn: null,
        descriptionSv: null,
        iconName: null,
        id: 1,
        nameEn: 'Included',
        nameSv: 'Inkluderad',
        sortOrder: 1,
      },
    ])
  })

  it('does not fetch non-system usage statuses by id', async () => {
    const { db, repository } = createSqlServerDb()

    await expect(getSpecificationItemStatusById(db, 7)).resolves.toBeNull()
    expect(repository.findOne).not.toHaveBeenCalled()
  })

  it('rejects editing non-system usage statuses', async () => {
    const { db, repository } = createSqlServerDb()

    await expect(
      updateSpecificationItemStatus(db, 7, { nameEn: 'Custom' }),
    ).rejects.toThrow('Only system usage statuses can be edited')
    expect(repository.update).not.toHaveBeenCalled()
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
