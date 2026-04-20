import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createOwner,
  deleteOwner,
  getOwnerById,
  listOwners,
  updateOwner,
} from '@/lib/dal/owners'
import { ownerEntity, type OwnerEntity } from '@/lib/typeorm/entities'

function createOwnerEntity(overrides: Partial<OwnerEntity> = {}): OwnerEntity {
  return {
    createdAt: new Date('2026-04-20T12:00:00.000Z'),
    email: 'anna@example.com',
    firstName: 'Anna',
    id: 1,
    lastName: 'Svensson',
    updatedAt: new Date('2026-04-20T12:00:00.000Z'),
    ...overrides,
  }
}

function createTypeOrmDb() {
  const repository = {
    create: vi.fn((data: Partial<OwnerEntity>) => createOwnerEntity(data)),
    delete: vi.fn<(id: number) => Promise<{ affected?: number | null }>>(),
    find: vi.fn<
      (options: {
        order: {
          firstName: 'ASC' | 'DESC'
          lastName: 'ASC' | 'DESC'
        }
      }) => Promise<OwnerEntity[]>
    >(),
    findOne: vi.fn<
      (options: { where: { id: number } }) => Promise<OwnerEntity | null>
    >(),
    save: vi.fn<(entity: OwnerEntity) => Promise<OwnerEntity>>(),
    update: vi.fn<
      (
        id: number,
        data: Partial<OwnerEntity>,
      ) => Promise<{ affected?: number | null }>
    >(),
  }

  const db: Parameters<typeof listOwners>[0] = {
    getRepository: vi.fn(target => {
      expect(target).toBe(ownerEntity)
      return repository
    }),
  }

  return { db, repository }
}

describe('owners DAL (TypeORM path)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.restoreAllMocks()
  })

  it('lists owners ordered by lastName then firstName', async () => {
    const { db, repository } = createTypeOrmDb()
    repository.find.mockResolvedValue([
      createOwnerEntity({
        email: 'erik@example.com',
        firstName: 'Erik',
        id: 2,
        lastName: 'Berg',
      }),
      createOwnerEntity(),
    ])

    const result = await listOwners(db)

    expect(repository.find).toHaveBeenCalledWith({
      order: {
        lastName: 'ASC',
        firstName: 'ASC',
      },
    })
    expect(result).toEqual([
      {
        email: 'erik@example.com',
        firstName: 'Erik',
        id: 2,
        lastName: 'Berg',
      },
      {
        email: 'anna@example.com',
        firstName: 'Anna',
        id: 1,
        lastName: 'Svensson',
      },
    ])
  })

  it('returns a single owner by id', async () => {
    const { db, repository } = createTypeOrmDb()
    repository.findOne.mockResolvedValue(createOwnerEntity())

    const result = await getOwnerById(db, 1)

    expect(repository.findOne).toHaveBeenCalledWith({
      where: { id: 1 },
    })
    expect(result).toEqual({
      email: 'anna@example.com',
      firstName: 'Anna',
      id: 1,
      lastName: 'Svensson',
    })
  })

  it('creates an owner and returns ISO timestamps', async () => {
    const { db, repository } = createTypeOrmDb()
    const saved = createOwnerEntity()
    repository.save.mockResolvedValue(saved)

    const result = await createOwner(db, {
      email: 'anna@example.com',
      firstName: 'Anna',
      lastName: 'Svensson',
    })

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'anna@example.com',
        firstName: 'Anna',
        lastName: 'Svensson',
      }),
    )
    expect(result).toEqual({
      createdAt: '2026-04-20T12:00:00.000Z',
      email: 'anna@example.com',
      firstName: 'Anna',
      id: 1,
      lastName: 'Svensson',
      updatedAt: '2026-04-20T12:00:00.000Z',
    })
  })

  it('updates an existing owner through repository update + findOne', async () => {
    const { db, repository } = createTypeOrmDb()
    repository.update.mockResolvedValue({ affected: 1 })
    repository.findOne.mockResolvedValue(
      createOwnerEntity({
        email: 'updated@example.com',
        firstName: 'Updated',
      }),
    )

    const result = await updateOwner(db, 1, {
      email: 'updated@example.com',
      firstName: 'Updated',
    })

    expect(repository.update).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        email: 'updated@example.com',
        firstName: 'Updated',
        updatedAt: expect.any(Date),
      }),
    )
    expect(result).toEqual({
      email: 'updated@example.com',
      firstName: 'Updated',
      id: 1,
      lastName: 'Svensson',
    })
  })

  it('returns null when an update affects no rows', async () => {
    const { db, repository } = createTypeOrmDb()
    repository.update.mockResolvedValue({ affected: 0 })

    const result = await updateOwner(db, 999, {
      firstName: 'Missing',
    })

    expect(result).toBeNull()
    expect(repository.findOne).not.toHaveBeenCalled()
  })

  it('deletes an owner using repository.delete', async () => {
    const { db, repository } = createTypeOrmDb()
    repository.delete.mockResolvedValue({ affected: 1 })

    const result = await deleteOwner(db, 1)

    expect(repository.delete).toHaveBeenCalledWith(1)
    expect(result).toBe(true)
  })
})
