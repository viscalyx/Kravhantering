import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createOwner,
  deleteOwner,
  getOwnerById,
  listOwners,
  updateOwner,
} from '@/lib/dal/owners'
import { ownerEntity } from '@/lib/typeorm/entities'

interface FakeRepository {
  create: ReturnType<typeof vi.fn>
  delete: ReturnType<typeof vi.fn>
  find: ReturnType<typeof vi.fn>
  findOne: ReturnType<typeof vi.fn>
  save: ReturnType<typeof vi.fn>
  update: ReturnType<typeof vi.fn>
}

function createSqlServerDb() {
  const repository: FakeRepository = {
    create: vi.fn(input => input),
    delete: vi.fn(),
    find: vi.fn(),
    findOne: vi.fn(),
    save: vi.fn(),
    update: vi.fn(),
  }
  const getRepository = vi.fn(() => repository)
  const db = {
    getRepository,
  } as unknown as Parameters<typeof listOwners>[0]
  return { db, getRepository, repository }
}

describe('owners DAL (TypeORM repository path)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('lists owners ordered by last name then first name', async () => {
    const { db, getRepository, repository } = createSqlServerDb()
    repository.find.mockResolvedValue([
      {
        id: 1,
        firstName: 'Ada',
        lastName: 'Lovelace',
        email: 'ada@example.com',
        hsaId: 'SE2321000032-ada1',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-02T00:00:00.000Z'),
      },
    ])

    const result = await listOwners(db)

    expect(getRepository).toHaveBeenCalledWith(ownerEntity)
    expect(repository.find).toHaveBeenCalledWith({
      order: { lastName: 'ASC', firstName: 'ASC' },
    })
    expect(result).toEqual([
      {
        id: 1,
        firstName: 'Ada',
        lastName: 'Lovelace',
        email: 'ada@example.com',
        hsaId: 'SE2321000032-ada1',
      },
    ])
  })

  it('returns null when getOwnerById finds no row', async () => {
    const { db, repository } = createSqlServerDb()
    repository.findOne.mockResolvedValue(null)

    const result = await getOwnerById(db, 99)

    expect(repository.findOne).toHaveBeenCalledWith({ where: { id: 99 } })
    expect(result).toBeNull()
  })

  it('returns the mapped owner when getOwnerById finds a row', async () => {
    const { db, repository } = createSqlServerDb()
    repository.findOne.mockResolvedValue({
      id: 5,
      firstName: 'Grace',
      lastName: 'Hopper',
      email: 'grace@example.com',
      hsaId: 'SE2321000032-grace1',
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    const result = await getOwnerById(db, 5)

    expect(result).toEqual({
      id: 5,
      firstName: 'Grace',
      lastName: 'Hopper',
      email: 'grace@example.com',
      hsaId: 'SE2321000032-grace1',
    })
  })

  it('creates an owner and returns the persisted record with ISO timestamps', async () => {
    const { db, repository } = createSqlServerDb()
    const createdAt = new Date('2026-04-21T08:00:00.000Z')
    const updatedAt = new Date('2026-04-21T08:00:00.000Z')
    repository.save.mockResolvedValue({
      id: 42,
      firstName: 'Edsger', // cSpell:ignore Edsger
      lastName: 'Dijkstra',
      email: 'edsger@example.com',
      hsaId: 'SE2321000032-edsger1',
      createdAt,
      updatedAt,
    })

    const result = await createOwner(db, {
      firstName: 'Edsger',
      lastName: 'Dijkstra',
      email: 'edsger@example.com',
      hsaId: 'SE2321000032-edsger1',
    })

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        firstName: 'Edsger',
        lastName: 'Dijkstra',
        email: 'edsger@example.com',
        hsaId: 'SE2321000032-edsger1',
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date),
      }),
    )
    expect(repository.save).toHaveBeenCalledTimes(1)
    expect(result).toEqual({
      id: 42,
      firstName: 'Edsger',
      lastName: 'Dijkstra',
      email: 'edsger@example.com',
      hsaId: 'SE2321000032-edsger1',
      createdAt: '2026-04-21T08:00:00.000Z',
      updatedAt: '2026-04-21T08:00:00.000Z',
    })
  })

  it('updates an owner and returns the refreshed row', async () => {
    const { db, repository } = createSqlServerDb()
    repository.update.mockResolvedValue({ affected: 1 })
    repository.findOne.mockResolvedValue({
      id: 7,
      firstName: 'Alan',
      lastName: 'Turing',
      email: 'alan@example.com',
      hsaId: 'SE2321000032-alan1',
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    const result = await updateOwner(db, 7, { firstName: 'Alan' })

    expect(repository.update).toHaveBeenCalledWith(
      7,
      expect.objectContaining({
        firstName: 'Alan',
        updatedAt: expect.any(Date),
      }),
    )
    expect(repository.findOne).toHaveBeenCalledWith({ where: { id: 7 } })
    expect(result).toEqual({
      id: 7,
      firstName: 'Alan',
      lastName: 'Turing',
      email: 'alan@example.com',
      hsaId: 'SE2321000032-alan1',
    })
  })

  it('returns null from updateOwner when no row was affected', async () => {
    const { db, repository } = createSqlServerDb()
    repository.update.mockResolvedValue({ affected: 0 })

    const result = await updateOwner(db, 404, { firstName: 'Ghost' })

    expect(repository.findOne).not.toHaveBeenCalled()
    expect(result).toBeNull()
  })

  it('deletes an owner and reports whether a row was removed', async () => {
    const { db, repository } = createSqlServerDb()
    repository.delete.mockResolvedValueOnce({ affected: 1 })
    repository.delete.mockResolvedValueOnce({ affected: 0 })

    await expect(deleteOwner(db, 1)).resolves.toBe(true)
    await expect(deleteOwner(db, 2)).resolves.toBe(false)
    expect(repository.delete).toHaveBeenNthCalledWith(1, 1)
    expect(repository.delete).toHaveBeenNthCalledWith(2, 2)
  })
})
