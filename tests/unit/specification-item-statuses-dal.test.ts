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

  it('returns mapped system usage statuses by id and reports missing rows', async () => {
    const { db, repository } = createSqlServerDb()
    repository.findOne
      .mockResolvedValueOnce({ ...statusEntity(2), iconName: 'loader' })
      .mockResolvedValueOnce(undefined)

    await expect(getSpecificationItemStatusById(db, 2)).resolves.toEqual({
      ...statusEntity(2),
      iconName: 'loader',
    })
    await expect(getSpecificationItemStatusById(db, 3)).resolves.toBeNull()
  })

  it('rejects editing non-system usage statuses', async () => {
    const { db, repository } = createSqlServerDb()

    await expect(
      updateSpecificationItemStatus(db, 7, { nameEn: 'Custom' }),
    ).rejects.toThrow('Only system usage statuses can be edited')
    expect(repository.update).not.toHaveBeenCalled()
  })

  it('updates every editable usage-status field while preserving a locked sort order', async () => {
    const { db, repository } = createSqlServerDb()
    repository.findOne.mockResolvedValueOnce({
      color: '#0f172a',
      descriptionEn: 'Included in delivery',
      descriptionSv: 'Ingår i leverans',
      iconName: 'circle-check',
      id: 1,
      nameEn: 'Included',
      nameSv: 'Inkluderad',
      sortOrder: 1,
    })

    await expect(
      updateSpecificationItemStatus(db, 1, {
        color: '#0f172a',
        descriptionEn: 'Included in delivery',
        descriptionSv: 'Ingår i leverans',
        iconName: 'circle-check',
        nameEn: 'Included',
        nameSv: 'Inkluderad',
        sortOrder: 99,
      }),
    ).resolves.toEqual({
      color: '#0f172a',
      descriptionEn: 'Included in delivery',
      descriptionSv: 'Ingår i leverans',
      iconName: 'circle-check',
      id: 1,
      nameEn: 'Included',
      nameSv: 'Inkluderad',
      sortOrder: 1,
    })
    expect(repository.update).toHaveBeenCalledWith(1, {
      color: '#0f172a',
      descriptionEn: 'Included in delivery',
      descriptionSv: 'Ingår i leverans',
      iconName: 'circle-check',
      nameEn: 'Included',
      nameSv: 'Inkluderad',
    })
  })

  it('preserves both boundary sort orders and allows ordering other statuses', async () => {
    const { db, repository } = createSqlServerDb()
    repository.findOne
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(statusEntity(2))

    await expect(
      updateSpecificationItemStatus(db, 5, { sortOrder: 99 }),
    ).resolves.toBeUndefined()
    await expect(
      updateSpecificationItemStatus(db, 2, { sortOrder: 9 }),
    ).resolves.toEqual(statusEntity(2))
    expect(repository.update).toHaveBeenCalledOnce()
    expect(repository.update).toHaveBeenCalledWith(2, { sortOrder: 9 })
  })

  it('treats an empty usage-status patch as an observable no-op', async () => {
    const { db, repository } = createSqlServerDb()
    repository.findOne.mockResolvedValueOnce(statusEntity(3))

    await expect(updateSpecificationItemStatus(db, 3, {})).resolves.toEqual(
      statusEntity(3),
    )
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
