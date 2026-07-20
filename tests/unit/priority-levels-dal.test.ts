import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  countLinkedRequirements,
  getLinkedRequirements,
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
  return { db, repository, getRepository, query }
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

  it('countLinkedRequirements counts library and specification-local usage', async () => {
    const { db, query } = createSqlServerDb()
    query.mockResolvedValueOnce([
      { count: 2, priorityLevelId: 4 },
      { count: 1, priorityLevelId: 5 },
    ])

    await expect(countLinkedRequirements(db)).resolves.toEqual({
      4: 2,
      5: 1,
    })

    const sql = String(query.mock.calls[0]?.[0])
    expect(sql).toContain('requirement_versions')
    expect(sql).toContain('specification_local_requirements')
    expect(sql).toContain('priority_level_id AS priorityLevelId')
  })

  it('getLinkedRequirements returns linked library and local requirement rows', async () => {
    const { db, query } = createSqlServerDb()
    query.mockResolvedValueOnce([
      {
        description: 'Library requirement',
        id: 10,
        source: 'library',
        statusColor: '#22c55e',
        statusIconName: 'CheckCircle2',
        statusNameEn: 'Published',
        statusNameSv: 'Publicerad',
        uniqueId: 'REQ-001',
        versionNumber: 2,
      },
      {
        description: 'Local requirement',
        id: 20,
        source: 'specificationLocal',
        statusColor: '#3b82f6',
        statusIconName: 'Clock',
        statusNameEn: 'Included',
        statusNameSv: 'Ingår',
        uniqueId: 'KRAV0001',
        versionNumber: 1,
      },
    ])

    await expect(getLinkedRequirements(db, 4)).resolves.toEqual([
      {
        description: 'Library requirement',
        id: 10,
        source: 'library',
        statusColor: '#22c55e',
        statusIconName: 'CheckCircle2',
        statusNameEn: 'Published',
        statusNameSv: 'Publicerad',
        uniqueId: 'REQ-001',
        versionNumber: 2,
      },
      {
        description: 'Local requirement',
        id: 20,
        source: 'specificationLocal',
        statusColor: '#3b82f6',
        statusIconName: 'Clock',
        statusNameEn: 'Included',
        statusNameSv: 'Ingår',
        uniqueId: 'KRAV0001',
        versionNumber: 1,
      },
    ])
    expect(query.mock.calls[0]?.[1]).toEqual([4])
    const sql = String(query.mock.calls[0]?.[0])
    expect(sql).toContain('requirement_versions.priority_level_id = @0')
    expect(sql).toContain('ROW_NUMBER() OVER')
    expect(sql).toContain('PARTITION BY requirement_versions.requirement_id')
    expect(sql).toContain("N'library' AS source")
    expect(sql).toContain("N'specificationLocal' AS source")
    expect(sql).toContain('local_requirement.priority_level_id = @0')
    expect(sql).toContain('specification_local_requirements local_requirement')
  })

  it.each([
    ['null', null, /Null value encountered in property 'PriorityLevel\.id'/],
    [
      'undefined',
      undefined,
      /Undefined value encountered in property 'PriorityLevel\.id'/,
    ],
  ])(
    'getPriorityLevelById rejects %s ids through runtime TypeORM where validation',
    async (_label, id, expectedError) => {
      const db = await createRuntimeSqlServerDb()

      await expect(
        getPriorityLevelById(db, id as unknown as number),
      ).rejects.toThrow(expectedError)
    },
  )

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
