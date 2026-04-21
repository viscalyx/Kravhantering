import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createQualityCharacteristic,
  createType,
  deleteQualityCharacteristic,
  deleteType,
  listQualityCharacteristics,
  listTypes,
  updateQualityCharacteristic,
  updateType,
} from '@/lib/dal/requirement-types'
import type { SqlServerDatabase } from '@/lib/db'
import { requirementTypeEntity } from '@/lib/typeorm/entities'

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

describe('requirement-types DAL (SQL Server path)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('listTypes returns types grouped with their quality characteristics', async () => {
    const { db, repository, getRepository, query } = createSqlServerDb()
    repository.find.mockResolvedValueOnce([
      { id: 1, nameSv: 'Funktionskrav', nameEn: 'Functional' },
      { id: 2, nameSv: 'Säkerhetskrav', nameEn: 'Security' },
    ])
    query.mockResolvedValueOnce([
      {
        id: 10,
        nameSv: 'Tillgänglighet',
        nameEn: 'Availability',
        requirementTypeId: 1,
        parentId: null,
      },
      {
        id: 11,
        nameSv: 'Integritet',
        nameEn: 'Integrity',
        requirementTypeId: 2,
        parentId: null,
      },
    ])

    const result = await listTypes(db)

    expect(getRepository).toHaveBeenCalledWith(requirementTypeEntity)
    expect(repository.find).toHaveBeenCalledWith({ order: { nameSv: 'ASC' } })
    expect(result).toHaveLength(2)
    expect(result[0]).toMatchObject({
      id: 1,
      nameSv: 'Funktionskrav',
      qualityCharacteristics: [expect.objectContaining({ id: 10 })],
    })
    expect(result[1].qualityCharacteristics[0]).toMatchObject({ id: 11 })
  })

  it('listQualityCharacteristics filters by typeId when provided', async () => {
    const { db, query } = createSqlServerDb()
    query.mockResolvedValueOnce([])

    await listQualityCharacteristics(db, 5)

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('WHERE requirement_type_id = @0'),
      [5],
    )
  })

  it('listQualityCharacteristics omits WHERE clause when no typeId', async () => {
    const { db, query } = createSqlServerDb()
    query.mockResolvedValueOnce([])

    await listQualityCharacteristics(db)

    const [sql, params] = query.mock.calls[0]
    expect(sql).not.toContain('WHERE')
    expect(params).toEqual([])
  })

  it('createType saves a new type and returns mapped row', async () => {
    const { db, repository } = createSqlServerDb()
    repository.save.mockImplementation(async row => ({ id: 99, ...row }))

    const result = await createType(db, { nameSv: 'Nytt', nameEn: 'New' })

    expect(repository.create).toHaveBeenCalledWith({
      nameSv: 'Nytt',
      nameEn: 'New',
    })
    expect(result).toEqual({ id: 99, nameSv: 'Nytt', nameEn: 'New' })
  })

  it('updateType applies only supplied fields and returns reloaded row', async () => {
    const { db, repository } = createSqlServerDb()
    repository.findOne.mockResolvedValueOnce({
      id: 3,
      nameSv: 'Uppdaterad',
      nameEn: 'Updated',
    })

    const result = await updateType(db, 3, { nameSv: 'Uppdaterad' })

    expect(repository.update).toHaveBeenCalledWith(3, { nameSv: 'Uppdaterad' })
    expect(result).toEqual({ id: 3, nameSv: 'Uppdaterad', nameEn: 'Updated' })
  })

  it('updateType skips update when no fields supplied', async () => {
    const { db, repository } = createSqlServerDb()
    repository.findOne.mockResolvedValueOnce({
      id: 3,
      nameSv: 'Same',
      nameEn: 'Same',
    })

    await updateType(db, 3, {})

    expect(repository.update).not.toHaveBeenCalled()
  })

  it('deleteType removes by id via the repository', async () => {
    const { db, repository } = createSqlServerDb()

    await deleteType(db, 42)

    expect(repository.delete).toHaveBeenCalledWith(42)
  })

  it('createQualityCharacteristic inserts with OUTPUT and returns row', async () => {
    const { db, query } = createSqlServerDb()
    query.mockResolvedValueOnce([
      {
        id: 50,
        nameSv: 'Prestanda',
        nameEn: 'Performance',
        requirementTypeId: 1,
        parentId: null,
      },
    ])

    const result = await createQualityCharacteristic(db, {
      nameSv: 'Prestanda',
      nameEn: 'Performance',
      requirementTypeId: 1,
    })

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO quality_characteristics'),
      ['Prestanda', 'Performance', 1, null],
    )
    expect(result).toMatchObject({ id: 50, parentId: null })
  })

  it('updateQualityCharacteristic builds a dynamic SET clause for provided fields', async () => {
    const { db, query } = createSqlServerDb()
    query.mockResolvedValueOnce([
      {
        id: 50,
        nameSv: 'Ny',
        nameEn: 'New',
        requirementTypeId: 2,
        parentId: null,
      },
    ])

    const result = await updateQualityCharacteristic(db, 50, {
      nameSv: 'Ny',
      requirementTypeId: 2,
    })

    const [sql, params] = query.mock.calls[0]
    expect(sql).toContain('name_sv = @0')
    expect(sql).toContain('requirement_type_id = @1')
    expect(sql).toContain('WHERE id = @2')
    expect(params).toEqual(['Ny', 2, 50])
    expect(result).toMatchObject({ id: 50 })
  })

  it('updateQualityCharacteristic returns current row when no fields supplied', async () => {
    const { db, query } = createSqlServerDb()
    query.mockResolvedValueOnce([
      {
        id: 50,
        nameSv: 'Unchanged',
        nameEn: 'Unchanged',
        requirementTypeId: 1,
        parentId: null,
      },
    ])

    const result = await updateQualityCharacteristic(db, 50, {})

    const [sql, params] = query.mock.calls[0]
    expect(sql).toMatch(/^\s*SELECT/)
    expect(params).toEqual([50])
    expect(result).toMatchObject({ id: 50 })
  })

  it('deleteQualityCharacteristic returns true when a row was deleted', async () => {
    const { db, query } = createSqlServerDb()
    query.mockResolvedValueOnce([{ id: 50 }])

    await expect(deleteQualityCharacteristic(db, 50)).resolves.toBe(true)
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM quality_characteristics'),
      [50],
    )
  })

  it('deleteQualityCharacteristic returns false when no row was deleted', async () => {
    const { db, query } = createSqlServerDb()
    query.mockResolvedValueOnce([])

    await expect(deleteQualityCharacteristic(db, 999)).resolves.toBe(false)
  })
})
