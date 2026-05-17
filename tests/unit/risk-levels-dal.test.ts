import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getRiskLevelById,
  listRiskLevels,
  updateRiskLevel,
} from '@/lib/dal/risk-levels'
import type { SqlServerDatabase } from '@/lib/db'
import { riskLevelEntity } from '@/lib/typeorm/entities'

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
  return { db, repository, getRepository }
}

describe('risk-levels DAL', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('listRiskLevels returns seeded system risk levels ordered by sortOrder', async () => {
    const { db, repository, getRepository } = createSqlServerDb()
    repository.find.mockResolvedValue([
      {
        color: '#22c55e',
        iconName: 'ArrowDownLeft',
        id: 1,
        nameEn: 'Low',
        nameSv: 'Låg',
        sortOrder: 1,
      },
      {
        color: '#64748b',
        iconName: null,
        id: 99,
        nameEn: 'Custom',
        nameSv: 'Anpassad',
        sortOrder: 99,
      },
    ])

    const result = await listRiskLevels(db)

    expect(getRepository).toHaveBeenCalledWith(riskLevelEntity)
    expect(repository.find).toHaveBeenCalledWith({
      order: { sortOrder: 'ASC' },
    })
    expect(result).toEqual([
      {
        color: '#22c55e',
        iconName: 'ArrowDownLeft',
        id: 1,
        nameEn: 'Low',
        nameSv: 'Låg',
        sortOrder: 1,
      },
    ])
  })

  it('getRiskLevelById ignores non-system ids', async () => {
    const { db, repository } = createSqlServerDb()

    await expect(getRiskLevelById(db, 99)).resolves.toBeNull()

    expect(repository.findOne).not.toHaveBeenCalled()
  })

  it('updateRiskLevel updates seeded risk levels', async () => {
    const { db, repository } = createSqlServerDb()
    repository.findOne.mockResolvedValueOnce({
      color: '#22c55e',
      iconName: 'ArrowDownLeft',
      id: 1,
      nameEn: 'Low',
      nameSv: 'Låg',
      sortOrder: 1,
    })

    const result = await updateRiskLevel(db, 1, {
      iconName: 'ArrowDownLeft',
      nameEn: 'Low',
    })

    expect(repository.update).toHaveBeenCalledWith(1, {
      iconName: 'ArrowDownLeft',
      nameEn: 'Low',
    })
    expect(result).toEqual({
      color: '#22c55e',
      iconName: 'ArrowDownLeft',
      id: 1,
      nameEn: 'Low',
      nameSv: 'Låg',
      sortOrder: 1,
    })
  })

  it('updateRiskLevel rejects non-system ids', async () => {
    const { db, repository } = createSqlServerDb()

    await expect(updateRiskLevel(db, 99, { nameEn: 'Custom' })).rejects.toThrow(
      /Only system risk levels can be edited/,
    )
    expect(repository.update).not.toHaveBeenCalled()
  })
})
