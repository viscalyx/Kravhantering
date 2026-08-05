import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createSpecificationGovernanceObjectType,
  deleteSpecificationGovernanceObjectType,
  listSpecificationGovernanceObjectTypes,
  updateSpecificationGovernanceObjectType,
} from '@/lib/dal/specification-governance-object-types'
import {
  createSpecificationImplementationType,
  deleteSpecificationImplementationType,
  listSpecificationImplementationTypes,
  updateSpecificationImplementationType,
} from '@/lib/dal/specification-implementation-types'
import {
  createSpecificationLifecycleStatus,
  deleteSpecificationLifecycleStatus,
  listSpecificationLifecycleStatuses,
  updateSpecificationLifecycleStatus,
} from '@/lib/dal/specification-lifecycle-statuses'

function createSqlServerDb() {
  const repository = {
    create: vi.fn((value: Record<string, unknown>) => ({ id: 7, ...value })),
    delete: vi.fn(),
    find: vi.fn(),
    findOne: vi.fn(),
    save: vi.fn(),
    update: vi.fn(),
  }
  const db = {
    getRepository: vi.fn(() => repository),
  }

  return { db, repository }
}

describe('specification reference type DALs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('governance object types', () => {
    it('lists and creates localized governance object types', async () => {
      const { db, repository } = createSqlServerDb()
      repository.find.mockResolvedValueOnce([
        { id: 2, nameEn: 'Service', nameSv: 'Tjänst' },
      ])
      repository.save.mockResolvedValueOnce({
        id: 7,
        nameEn: 'Contract',
        nameSv: 'Avtal',
      })

      await expect(
        listSpecificationGovernanceObjectTypes(db as never),
      ).resolves.toEqual([{ id: 2, nameEn: 'Service', nameSv: 'Tjänst' }])
      await expect(
        createSpecificationGovernanceObjectType(db as never, {
          nameEn: 'Contract',
          nameSv: 'Avtal',
        }),
      ).resolves.toEqual({ id: 7, nameEn: 'Contract', nameSv: 'Avtal' })
      expect(repository.find).toHaveBeenCalledWith({
        order: { nameSv: 'ASC' },
      })
    })

    it('supports partial and no-op updates and reports a missing row', async () => {
      const { db, repository } = createSqlServerDb()
      repository.findOne
        .mockResolvedValueOnce({ id: 3, nameEn: 'Service', nameSv: 'Tjänst' })
        .mockResolvedValueOnce(undefined)

      await expect(
        updateSpecificationGovernanceObjectType(db as never, 3, {
          nameEn: 'Service',
          nameSv: 'Tjänst',
        }),
      ).resolves.toEqual({ id: 3, nameEn: 'Service', nameSv: 'Tjänst' })
      await expect(
        updateSpecificationGovernanceObjectType(db as never, 99, {}),
      ).resolves.toBeUndefined()
      expect(repository.update).toHaveBeenCalledOnce()
      expect(repository.update).toHaveBeenCalledWith(3, {
        nameEn: 'Service',
        nameSv: 'Tjänst',
      })
    })

    it('returns the deleted count and treats an unknown count as zero', async () => {
      const { db, repository } = createSqlServerDb()
      repository.delete
        .mockResolvedValueOnce({ affected: 1 })
        .mockResolvedValueOnce({})

      await expect(
        deleteSpecificationGovernanceObjectType(db as never, 3),
      ).resolves.toBe(1)
      await expect(
        deleteSpecificationGovernanceObjectType(db as never, 4),
      ).resolves.toBe(0)
    })
  })

  describe('implementation types', () => {
    it('lists and creates localized implementation types', async () => {
      const { db, repository } = createSqlServerDb()
      repository.find.mockResolvedValueOnce([
        { id: 2, nameEn: 'Contract', nameSv: 'Avtal' },
      ])
      repository.save.mockResolvedValueOnce({
        id: 7,
        nameEn: 'Policy',
        nameSv: 'Policy',
      })

      await expect(
        listSpecificationImplementationTypes(db as never),
      ).resolves.toEqual([{ id: 2, nameEn: 'Contract', nameSv: 'Avtal' }])
      await expect(
        createSpecificationImplementationType(db as never, {
          nameEn: 'Policy',
          nameSv: 'Policy',
        }),
      ).resolves.toEqual({ id: 7, nameEn: 'Policy', nameSv: 'Policy' })
      expect(repository.find).toHaveBeenCalledWith({
        order: { nameSv: 'ASC' },
      })
    })

    it('supports partial and no-op updates and reports a missing row', async () => {
      const { db, repository } = createSqlServerDb()
      repository.findOne
        .mockResolvedValueOnce({ id: 3, nameEn: 'Contract', nameSv: 'Avtal' })
        .mockResolvedValueOnce(undefined)

      await expect(
        updateSpecificationImplementationType(db as never, 3, {
          nameEn: 'Contract',
          nameSv: 'Avtal',
        }),
      ).resolves.toEqual({ id: 3, nameEn: 'Contract', nameSv: 'Avtal' })
      await expect(
        updateSpecificationImplementationType(db as never, 99, {}),
      ).resolves.toBeUndefined()
      expect(repository.update).toHaveBeenCalledOnce()
      expect(repository.update).toHaveBeenCalledWith(3, {
        nameEn: 'Contract',
        nameSv: 'Avtal',
      })
    })

    it('returns the deleted count and treats an unknown count as zero', async () => {
      const { db, repository } = createSqlServerDb()
      repository.delete
        .mockResolvedValueOnce({ affected: 1 })
        .mockResolvedValueOnce({})

      await expect(
        deleteSpecificationImplementationType(db as never, 3),
      ).resolves.toBe(1)
      await expect(
        deleteSpecificationImplementationType(db as never, 4),
      ).resolves.toBe(0)
    })
  })

  describe('lifecycle statuses', () => {
    it('lists and creates trimmed localized lifecycle statuses', async () => {
      const { db, repository } = createSqlServerDb()
      repository.find.mockResolvedValueOnce([
        { id: 2, nameEn: 'Active', nameSv: 'Aktiv' },
      ])
      repository.save.mockResolvedValueOnce({
        id: 7,
        nameEn: 'Retired',
        nameSv: 'Avslutad',
      })

      await expect(
        listSpecificationLifecycleStatuses(db as never),
      ).resolves.toEqual([{ id: 2, nameEn: 'Active', nameSv: 'Aktiv' }])
      await expect(
        createSpecificationLifecycleStatus(db as never, {
          nameEn: ' Retired ',
          nameSv: ' Avslutad ',
        }),
      ).resolves.toEqual({ id: 7, nameEn: 'Retired', nameSv: 'Avslutad' })
      expect(repository.create).toHaveBeenCalledWith({
        nameEn: 'Retired',
        nameSv: 'Avslutad',
      })
    })

    it.each([
      [{ nameEn: 'Active', nameSv: '   ' }],
      [{ nameEn: '   ', nameSv: 'Aktiv' }],
    ])('rejects a create with an empty localized name: %j', async data => {
      const { db, repository } = createSqlServerDb()

      await expect(
        createSpecificationLifecycleStatus(db as never, data),
      ).rejects.toThrow('nameSv and nameEn are required')
      expect(repository.save).not.toHaveBeenCalled()
    })

    it('supports trimmed partial updates and reports a missing row', async () => {
      const { db, repository } = createSqlServerDb()
      repository.findOne
        .mockResolvedValueOnce({ id: 3, nameEn: 'Active', nameSv: 'Aktiv' })
        .mockResolvedValueOnce(undefined)

      await expect(
        updateSpecificationLifecycleStatus(db as never, 3, {
          nameEn: ' Active ',
          nameSv: ' Aktiv ',
        }),
      ).resolves.toEqual({ id: 3, nameEn: 'Active', nameSv: 'Aktiv' })
      await expect(
        updateSpecificationLifecycleStatus(db as never, 99, {}),
      ).resolves.toBeUndefined()
      expect(repository.update).toHaveBeenCalledOnce()
      expect(repository.update).toHaveBeenCalledWith(3, {
        nameEn: 'Active',
        nameSv: 'Aktiv',
      })
    })

    it.each([
      [{ nameSv: '   ' }, 'nameSv must not be empty'],
      [{ nameEn: '   ' }, 'nameEn must not be empty'],
    ])(
      'rejects an update with an empty localized name: %j',
      async (data, error) => {
        const { db, repository } = createSqlServerDb()

        await expect(
          updateSpecificationLifecycleStatus(db as never, 3, data),
        ).rejects.toThrow(error)
        expect(repository.update).not.toHaveBeenCalled()
      },
    )

    it('returns the deleted count and treats an unknown count as zero', async () => {
      const { db, repository } = createSqlServerDb()
      repository.delete
        .mockResolvedValueOnce({ affected: 1 })
        .mockResolvedValueOnce({})

      await expect(
        deleteSpecificationLifecycleStatus(db as never, 3),
      ).resolves.toBe(1)
      await expect(
        deleteSpecificationLifecycleStatus(db as never, 4),
      ).resolves.toBe(0)
    })
  })
})
