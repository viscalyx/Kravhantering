import { describe, expect, it, vi } from 'vitest'
import {
  countLinkedRequirements,
  getPriorityLevelById,
  updatePriorityLevel,
} from '@/lib/dal/priority-levels'
import {
  getTransitionsFrom,
  listTransitions,
  updateStatus,
} from '@/lib/dal/requirement-statuses'
import {
  createQualityCharacteristic,
  hasChildQualityCharacteristics,
  listTypes,
  updateQualityCharacteristic,
  updateType,
} from '@/lib/dal/requirement-types'
import type { SqlServerDatabase } from '@/lib/db'

function database() {
  const repository = {
    create: vi.fn(value => value),
    delete: vi.fn(),
    find: vi.fn(),
    findOne: vi.fn(),
    save: vi.fn(),
    update: vi.fn(),
  }
  const query = vi.fn()
  return {
    db: {
      getRepository: vi.fn(() => repository),
      query,
    } as unknown as SqlServerDatabase,
    query,
    repository,
  }
}

const priority = {
  assessmentCriteriaEn: 'Assess',
  assessmentCriteriaSv: 'Bedom',
  code: 'P1',
  color: '#123456',
  descriptionEn: 'Description',
  descriptionSv: 'Beskrivning',
  iconName: null,
  id: 1,
  nameEn: 'Critical',
  nameSv: 'Kritisk',
  sortOrder: 1,
}

const status = {
  color: '#123456',
  iconName: null,
  id: 1,
  isSystem: true,
  nameEn: 'Draft',
  nameSv: 'Utkast',
  sortOrder: 1,
}

describe('priority DAL edge branches', () => {
  it('returns null for an absent priority and ignores null count groups', async () => {
    const { db, repository, query } = database()
    repository.findOne.mockResolvedValue(null)
    query.mockResolvedValue([
      { count: 5, priorityLevelId: null },
      { count: 2, priorityLevelId: 1 },
    ])
    await expect(getPriorityLevelById(db, 99)).resolves.toBeNull()
    await expect(countLinkedRequirements(db)).resolves.toEqual({ 1: 2 })
  })

  it('applies every editable priority field and rejects a missing reload', async () => {
    const { db, repository } = database()
    repository.findOne.mockResolvedValueOnce(priority)
    await expect(
      updatePriorityLevel(db, 1, {
        assessmentCriteriaEn: 'A',
        assessmentCriteriaSv: 'B',
        color: '#abcdef',
        descriptionEn: 'C',
        descriptionSv: 'D',
        iconName: 'Circle',
        nameEn: 'E',
        nameSv: 'F',
        sortOrder: 9,
      }),
    ).resolves.toMatchObject({ id: 1 })
    expect(repository.update).toHaveBeenCalledWith(1, {
      assessmentCriteriaEn: 'A',
      assessmentCriteriaSv: 'B',
      color: '#abcdef',
      descriptionEn: 'C',
      descriptionSv: 'D',
      iconName: 'Circle',
      nameEn: 'E',
      nameSv: 'F',
      sortOrder: 9,
    })

    repository.findOne.mockResolvedValueOnce(null)
    await expect(updatePriorityLevel(db, 1, {})).rejects.toMatchObject({
      code: 'not_found',
    })
  })
})

describe('status DAL edge branches', () => {
  it('applies all status fields and returns undefined after an empty reload', async () => {
    const { db, repository } = database()
    repository.findOne
      .mockResolvedValueOnce(status)
      .mockResolvedValueOnce(status)
      .mockResolvedValueOnce(status)
      .mockResolvedValueOnce(null)
    await updateStatus(db, 1, {
      color: '#abcdef',
      iconName: 'Circle',
      nameEn: 'Review',
      nameSv: 'Granskning',
      sortOrder: 2,
    })
    expect(repository.update).toHaveBeenCalledWith(1, {
      color: '#abcdef',
      iconName: 'Circle',
      nameEn: 'Review',
      nameSv: 'Granskning',
      sortOrder: 2,
    })
    await expect(updateStatus(db, 1, {})).resolves.toBeUndefined()
  })

  it('drops transitions with either missing endpoint and missing targets', async () => {
    const { db, repository, query } = database()
    repository.find.mockResolvedValue([status])
    query.mockResolvedValueOnce([
      { fromStatusId: 99, id: 1, toStatusId: 1 },
      { fromStatusId: 1, id: 2, toStatusId: 99 },
    ])
    await expect(listTransitions(db)).resolves.toEqual([])

    query.mockResolvedValueOnce([{ fromStatusId: 1, id: 3, toStatusId: 99 }])
    await expect(getTransitionsFrom(db, 1)).resolves.toEqual([])
  })
})

describe('requirement type DAL edge branches', () => {
  it('supports empty characteristic groups, absent children, and absent updates', async () => {
    const { db, repository, query } = database()
    repository.find.mockResolvedValue([
      { id: 1, nameEn: 'Type', nameSv: 'Typ' },
    ])
    query.mockResolvedValueOnce([])
    await expect(listTypes(db)).resolves.toEqual([
      { id: 1, nameEn: 'Type', nameSv: 'Typ', qualityCharacteristics: [] },
    ])
    query.mockResolvedValueOnce([])
    await expect(hasChildQualityCharacteristics(db, 1)).resolves.toBe(false)
    repository.findOne.mockResolvedValue(null)
    await expect(
      updateType(db, 1, { nameEn: 'Updated' }),
    ).resolves.toBeUndefined()
  })

  it('passes an explicit parent and returns null for empty quality updates', async () => {
    const { db, query } = database()
    query.mockResolvedValueOnce([{ id: 5 }])
    await createQualityCharacteristic(db, {
      chapterId: '3.1',
      nameEn: 'Child',
      nameSv: 'Barn',
      parentId: 4,
      requirementTypeId: 1,
    })
    expect(query.mock.calls[0][1]).toEqual(['3.1', 'Barn', 'Child', 1, 4])

    query.mockResolvedValueOnce([])
    await expect(
      updateQualityCharacteristic(db, 5, { nameEn: 'Updated', parentId: null }),
    ).resolves.toBeNull()
    query.mockResolvedValueOnce([])
    await expect(updateQualityCharacteristic(db, 5, {})).resolves.toBeNull()
  })
})
