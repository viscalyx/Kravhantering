import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createTransition,
  deleteTransition,
  getTransitionsFrom,
  listStatuses,
  listTransitions,
  updateStatus,
} from '@/lib/dal/requirement-statuses'
import type { SqlServerDatabase } from '@/lib/db'
import { requirementStatusEntity } from '@/lib/typeorm/entities'

function createSqlServerDb() {
  const repository = {
    find: vi.fn(),
    findOne: vi.fn(),
    update: vi.fn(),
  }
  const getRepository = vi.fn(() => repository)
  const query =
    vi.fn<(sql: string, parameters?: unknown[]) => Promise<unknown[]>>()
  const db = {
    getRepository,
    query,
  } as unknown as SqlServerDatabase
  return { db, repository, getRepository, query }
}

describe('requirement-statuses DAL (SQL Server path)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('listStatuses returns system statuses ordered by sortOrder', async () => {
    const { db, repository, getRepository } = createSqlServerDb()
    repository.find.mockResolvedValue([
      {
        id: 1,
        nameEn: 'Draft',
        nameSv: 'Utkast',
        sortOrder: 1,
        color: 'blue',
        isSystem: 1,
      },
      {
        id: 2,
        nameEn: 'Review',
        nameSv: 'Granskning',
        sortOrder: 2,
        color: 'yellow',
        iconName: 'Eye',
        isSystem: 1,
      },
    ])

    const result = await listStatuses(db)

    expect(getRepository).toHaveBeenCalledWith(requirementStatusEntity)
    expect(repository.find).toHaveBeenCalledWith({
      order: { sortOrder: 'ASC' },
      where: { isSystem: true },
    })
    expect(result).toEqual([
      {
        id: 1,
        nameEn: 'Draft',
        nameSv: 'Utkast',
        sortOrder: 1,
        color: 'blue',
        iconName: null,
        isSystem: true,
      },
      {
        id: 2,
        nameEn: 'Review',
        nameSv: 'Granskning',
        sortOrder: 2,
        color: 'yellow',
        iconName: 'Eye',
        isSystem: true,
      },
    ])
  })

  it('updateStatus updates a system status and returns the reloaded row', async () => {
    const { db, repository } = createSqlServerDb()
    repository.findOne
      .mockResolvedValueOnce({
        id: 5,
        nameEn: 'Review',
        nameSv: 'Granskning',
        sortOrder: 2,
        color: 'yellow',
        isSystem: 1,
      })
      .mockResolvedValueOnce({
        id: 5,
        nameEn: 'Review',
        nameSv: 'Granskning',
        sortOrder: 2,
        color: '#eab308',
        iconName: 'Eye',
        isSystem: 1,
      })

    const result = await updateStatus(db, 5, {
      color: '#eab308',
      iconName: 'Eye',
    })

    expect(repository.update).toHaveBeenCalledWith(5, {
      color: '#eab308',
      iconName: 'Eye',
    })
    expect(result).toEqual({
      id: 5,
      nameEn: 'Review',
      nameSv: 'Granskning',
      sortOrder: 2,
      color: '#eab308',
      iconName: 'Eye',
      isSystem: true,
    })
  })

  it('updateStatus rejects non-system statuses', async () => {
    const { db, repository } = createSqlServerDb()
    repository.findOne.mockResolvedValueOnce({
      id: 8,
      nameEn: 'Custom',
      nameSv: 'Anpassad',
      sortOrder: 10,
      color: 'red',
      isSystem: 0,
    })

    await expect(updateStatus(db, 8, { nameEn: 'Custom' })).rejects.toThrow(
      /Only system requirement statuses can be edited/,
    )
    expect(repository.update).not.toHaveBeenCalled()
  })

  it('updateStatus rejects missing statuses', async () => {
    const { db, repository } = createSqlServerDb()
    repository.findOne.mockResolvedValueOnce(null)

    await expect(updateStatus(db, 404, { nameEn: 'Missing' })).rejects.toThrow(
      /Status not found/,
    )
    expect(repository.update).not.toHaveBeenCalled()
  })

  it('listTransitions joins raw transition rows with system status list', async () => {
    const { db, repository, query } = createSqlServerDb()
    query.mockResolvedValueOnce([
      { id: 20, fromStatusId: 1, toStatusId: 2 },
      { id: 21, fromStatusId: 2, toStatusId: 3 },
    ])
    repository.find.mockResolvedValueOnce([
      {
        id: 1,
        nameEn: 'Draft',
        nameSv: 'Utkast',
        sortOrder: 1,
        color: 'blue',
        isSystem: 1,
      },
      {
        id: 2,
        nameEn: 'Review',
        nameSv: 'Granskning',
        sortOrder: 2,
        color: 'yellow',
        isSystem: 1,
      },
      {
        id: 3,
        nameEn: 'Published',
        nameSv: 'Publicerad',
        sortOrder: 3,
        color: 'green',
        isSystem: 1,
      },
    ])

    const result = await listTransitions(db)

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('FROM requirement_status_transitions'),
    )
    expect(result).toHaveLength(2)
    expect(result[0]).toMatchObject({
      id: 20,
      fromStatusId: 1,
      toStatusId: 2,
      fromStatus: expect.objectContaining({ nameEn: 'Draft' }),
      toStatus: expect.objectContaining({ nameEn: 'Review' }),
    })
  })

  it('getTransitionsFrom returns only target statuses reachable from source', async () => {
    const { db, repository, query } = createSqlServerDb()
    query.mockResolvedValueOnce([
      { id: 20, fromStatusId: 1, toStatusId: 2 },
      { id: 21, fromStatusId: 1, toStatusId: 3 },
    ])
    repository.find.mockResolvedValueOnce([
      {
        id: 1,
        nameEn: 'Draft',
        nameSv: 'Utkast',
        sortOrder: 1,
        color: 'blue',
        isSystem: 1,
      },
      {
        id: 2,
        nameEn: 'Review',
        nameSv: 'Granskning',
        sortOrder: 2,
        color: 'yellow',
        isSystem: 1,
      },
      {
        id: 3,
        nameEn: 'Published',
        nameSv: 'Publicerad',
        sortOrder: 3,
        color: 'green',
        isSystem: 1,
      },
    ])

    const result = await getTransitionsFrom(db, 1)

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('from_requirement_status_id = @0'),
      [1],
    )
    expect(result.map(r => r.id)).toEqual([2, 3])
  })

  it('createTransition runs an OUTPUT-returning insert and returns the row', async () => {
    const { db, query } = createSqlServerDb()
    query.mockResolvedValueOnce([{ id: 99, fromStatusId: 1, toStatusId: 2 }])

    const result = await createTransition(db, 1, 2)

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO requirement_status_transitions'),
      [1, 2],
    )
    expect(result).toEqual({ id: 99, fromStatusId: 1, toStatusId: 2 })
  })

  it('deleteTransition issues a parameterized DELETE', async () => {
    const { db, query } = createSqlServerDb()
    query.mockResolvedValueOnce([])

    await deleteTransition(db, 77)

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM requirement_status_transitions'),
      [77],
    )
  })
})
