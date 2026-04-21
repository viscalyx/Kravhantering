import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createStatus,
  createTransition,
  deleteStatus,
  deleteTransition,
  getStatusById,
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
    create: vi.fn(input => input),
    save: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
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

  it('listStatuses returns statuses ordered by sortOrder', async () => {
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
        isSystem: 0,
      },
    ])

    const result = await listStatuses(db)

    expect(getRepository).toHaveBeenCalledWith(requirementStatusEntity)
    expect(repository.find).toHaveBeenCalledWith({
      order: { sortOrder: 'ASC' },
    })
    expect(result).toEqual([
      {
        id: 1,
        nameEn: 'Draft',
        nameSv: 'Utkast',
        sortOrder: 1,
        color: 'blue',
        isSystem: true,
      },
      {
        id: 2,
        nameEn: 'Review',
        nameSv: 'Granskning',
        sortOrder: 2,
        color: 'yellow',
        isSystem: false,
      },
    ])
  })

  it('getStatusById returns mapped record or null', async () => {
    const { db, repository } = createSqlServerDb()
    repository.findOne.mockResolvedValueOnce({
      id: 3,
      nameEn: 'Published',
      nameSv: 'Publicerad',
      sortOrder: 3,
      color: 'green',
      isSystem: 1,
    })
    await expect(getStatusById(db, 3)).resolves.toEqual({
      id: 3,
      nameEn: 'Published',
      nameSv: 'Publicerad',
      sortOrder: 3,
      color: 'green',
      isSystem: true,
    })
    expect(repository.findOne).toHaveBeenCalledWith({ where: { id: 3 } })

    repository.findOne.mockResolvedValueOnce(null)
    await expect(getStatusById(db, 999)).resolves.toBeNull()
  })

  it('createStatus persists a non-system status by default', async () => {
    const { db, repository } = createSqlServerDb()
    repository.save.mockImplementation(async row => ({ id: 10, ...row }))

    const result = await createStatus(db, {
      nameEn: 'Draft',
      nameSv: 'Utkast',
      sortOrder: 1,
      color: 'blue',
    })

    expect(repository.create).toHaveBeenCalledWith({
      nameEn: 'Draft',
      nameSv: 'Utkast',
      sortOrder: 1,
      color: 'blue',
      isSystem: false,
    })
    expect(repository.save).toHaveBeenCalled()
    expect(result).toMatchObject({ id: 10, nameEn: 'Draft', isSystem: false })
  })

  it('updateStatus applies only supplied fields and returns the reloaded row', async () => {
    const { db, repository } = createSqlServerDb()
    repository.findOne.mockResolvedValueOnce({
      id: 5,
      nameEn: 'Review',
      nameSv: 'Granskning',
      sortOrder: 2,
      color: 'yellow',
      isSystem: 0,
    })

    const result = await updateStatus(db, 5, {
      nameEn: 'Review',
      color: 'yellow',
    })

    expect(repository.update).toHaveBeenCalledWith(5, {
      nameEn: 'Review',
      color: 'yellow',
    })
    expect(result).toMatchObject({ id: 5, nameEn: 'Review', color: 'yellow' })
  })

  it('updateStatus skips the update call when no fields supplied', async () => {
    const { db, repository } = createSqlServerDb()
    repository.findOne.mockResolvedValueOnce({
      id: 5,
      nameEn: 'Review',
      nameSv: 'Granskning',
      sortOrder: 2,
      color: 'yellow',
      isSystem: 0,
    })

    await updateStatus(db, 5, {})

    expect(repository.update).not.toHaveBeenCalled()
    expect(repository.findOne).toHaveBeenCalledWith({ where: { id: 5 } })
  })

  it('deleteStatus rejects when status is system-protected', async () => {
    const { db, repository, query } = createSqlServerDb()
    repository.findOne.mockResolvedValueOnce({
      id: 7,
      nameEn: 'System',
      nameSv: 'System',
      sortOrder: 1,
      color: 'gray',
      isSystem: 1,
    })

    await expect(deleteStatus(db, 7)).rejects.toThrow(
      /Cannot delete a system status/,
    )
    expect(query).not.toHaveBeenCalled()
    expect(repository.delete).not.toHaveBeenCalled()
  })

  it('deleteStatus rejects when status is in use', async () => {
    const { db, repository, query } = createSqlServerDb()
    repository.findOne.mockResolvedValueOnce({
      id: 8,
      nameEn: 'Custom',
      nameSv: 'Anpassad',
      sortOrder: 10,
      color: 'red',
      isSystem: 0,
    })
    query.mockResolvedValueOnce([{ count: 2 }])

    await expect(deleteStatus(db, 8)).rejects.toThrow(/in use/)
    expect(repository.delete).not.toHaveBeenCalled()
  })

  it('deleteStatus deletes when status is unused', async () => {
    const { db, repository, query } = createSqlServerDb()
    repository.findOne.mockResolvedValueOnce({
      id: 9,
      nameEn: 'Custom',
      nameSv: 'Anpassad',
      sortOrder: 10,
      color: 'red',
      isSystem: 0,
    })
    query.mockResolvedValueOnce([{ count: 0 }])

    await deleteStatus(db, 9)

    expect(repository.delete).toHaveBeenCalledWith(9)
  })

  it('listTransitions joins raw transition rows with status list', async () => {
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
        isSystem: 0,
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
        isSystem: 0,
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
