import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getPriorityLevelById,
  listPriorityLevels,
  updatePriorityLevel,
} from '@/lib/dal/priority-levels'
import type { SqlServerDatabase } from '@/lib/db'
import { createAppDataSource } from '@/lib/typeorm/data-source'
import { priorityLevelEntity } from '@/lib/typeorm/entities'

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

async function createRuntimeSqlServerDb(): Promise<SqlServerDatabase> {
  const db = createAppDataSource({
    url: 'mssql://app:secret@127.0.0.1:1/kravhantering?encrypt=false&trustServerCertificate=true',
  })
  // TypeORM validates invalid where values before opening a connection; building
  // metadata is enough to exercise the real repository lookup path.
  await (
    db as unknown as { buildMetadatas: () => Promise<void> }
  ).buildMetadatas()
  return db
}

describe('priority-levels DAL', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('listPriorityLevels returns all priority levels ordered by sortOrder', async () => {
    const { db, repository, getRepository } = createSqlServerDb()
    repository.find.mockResolvedValue([
      {
        assessmentCriteriaEn: 'Low assessment',
        assessmentCriteriaSv: 'Låg bedömning',
        code: 'P2',
        color: '#22c55e',
        descriptionEn: 'Low priority',
        descriptionSv: 'Låg prioritet',
        iconName: 'ArrowDownLeft',
        id: 2,
        nameEn: 'Low',
        nameSv: 'Låg',
        sortOrder: 1,
      },
      {
        assessmentCriteriaEn: 'Custom assessment',
        assessmentCriteriaSv: 'Anpassad bedömning',
        code: 'PX',
        color: '#64748b',
        descriptionEn: 'Custom priority',
        descriptionSv: 'Anpassad prioritet',
        iconName: null,
        id: 99,
        nameEn: 'Custom',
        nameSv: 'Anpassad',
        sortOrder: 99,
      },
    ])

    const result = await listPriorityLevels(db)

    expect(getRepository).toHaveBeenCalledWith(priorityLevelEntity)
    expect(repository.find).toHaveBeenCalledWith({
      order: { sortOrder: 'ASC' },
    })
    expect(result).toEqual([
      {
        assessmentCriteriaEn: 'Low assessment',
        assessmentCriteriaSv: 'Låg bedömning',
        code: 'P2',
        color: '#22c55e',
        descriptionEn: 'Low priority',
        descriptionSv: 'Låg prioritet',
        iconName: 'ArrowDownLeft',
        id: 2,
        nameEn: 'Low',
        nameSv: 'Låg',
        sortOrder: 1,
      },
      {
        assessmentCriteriaEn: 'Custom assessment',
        assessmentCriteriaSv: 'Anpassad bedömning',
        code: 'PX',
        color: '#64748b',
        descriptionEn: 'Custom priority',
        descriptionSv: 'Anpassad prioritet',
        iconName: null,
        id: 99,
        nameEn: 'Custom',
        nameSv: 'Anpassad',
        sortOrder: 99,
      },
    ])
  })

  it('getPriorityLevelById returns non-system ids when present', async () => {
    const { db, repository } = createSqlServerDb()
    repository.findOne.mockResolvedValueOnce({
      assessmentCriteriaEn: 'Custom assessment',
      assessmentCriteriaSv: 'Anpassad bedömning',
      code: 'PX',
      color: '#64748b',
      descriptionEn: 'Custom priority',
      descriptionSv: 'Anpassad prioritet',
      iconName: null,
      id: 99,
      nameEn: 'Custom',
      nameSv: 'Anpassad',
      sortOrder: 99,
    })

    await expect(getPriorityLevelById(db, 99)).resolves.toEqual({
      assessmentCriteriaEn: 'Custom assessment',
      assessmentCriteriaSv: 'Anpassad bedömning',
      code: 'PX',
      color: '#64748b',
      descriptionEn: 'Custom priority',
      descriptionSv: 'Anpassad prioritet',
      iconName: null,
      id: 99,
      nameEn: 'Custom',
      nameSv: 'Anpassad',
      sortOrder: 99,
    })

    expect(repository.findOne).toHaveBeenCalledWith({ where: { id: 99 } })
  })

  it.each([
    ['null', null, /Null value encountered in property 'PriorityLevel\.id'/],
    [
      'undefined',
      undefined,
      /Undefined value encountered in property 'PriorityLevel\.id'/,
    ],
  ])('getPriorityLevelById rejects %s ids through runtime TypeORM where validation', async (_label, id, expectedError) => {
    const db = await createRuntimeSqlServerDb()

    await expect(
      getPriorityLevelById(db, id as unknown as number),
    ).rejects.toThrow(expectedError)
  })

  it('updatePriorityLevel updates seeded priority levels', async () => {
    const { db, repository } = createSqlServerDb()
    repository.findOne.mockResolvedValueOnce({
      assessmentCriteriaEn: 'Low assessment',
      assessmentCriteriaSv: 'Låg bedömning',
      code: 'P2',
      color: '#22c55e',
      descriptionEn: 'Low priority',
      descriptionSv: 'Låg prioritet',
      iconName: 'ArrowDownLeft',
      id: 2,
      nameEn: 'Low',
      nameSv: 'Låg',
      sortOrder: 1,
    })

    const result = await updatePriorityLevel(db, 2, {
      iconName: 'ArrowDownLeft',
      nameEn: 'Low',
    })

    expect(repository.update).toHaveBeenCalledWith(2, {
      iconName: 'ArrowDownLeft',
      nameEn: 'Low',
    })
    expect(result).toEqual({
      assessmentCriteriaEn: 'Low assessment',
      assessmentCriteriaSv: 'Låg bedömning',
      code: 'P2',
      color: '#22c55e',
      descriptionEn: 'Low priority',
      descriptionSv: 'Låg prioritet',
      iconName: 'ArrowDownLeft',
      id: 2,
      nameEn: 'Low',
      nameSv: 'Låg',
      sortOrder: 1,
    })
  })

  it('updatePriorityLevel rejects non-system ids', async () => {
    const { db, repository } = createSqlServerDb()

    await expect(
      updatePriorityLevel(db, 99, { nameEn: 'Custom' }),
    ).rejects.toThrow(/Only system priority levels can be edited/)
    expect(repository.update).not.toHaveBeenCalled()
  })
})
