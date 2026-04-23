import type { SqlServerDatabase } from '@/lib/db'
import { type OwnerEntity, ownerEntity } from '@/lib/typeorm/entities'

export interface Owner {
  email: string
  firstName: string
  id: number
  lastName: string
}

export interface PersistedOwner extends Owner {
  createdAt: string
  updatedAt: string
}

function mapOwnerRecord(
  owner: Pick<OwnerEntity, 'email' | 'firstName' | 'id' | 'lastName'>,
): Owner {
  return {
    email: owner.email,
    firstName: owner.firstName,
    id: owner.id,
    lastName: owner.lastName,
  }
}

function mapPersistedOwner(owner: OwnerEntity): PersistedOwner {
  return {
    ...mapOwnerRecord(owner),
    createdAt: owner.createdAt.toISOString(),
    updatedAt: owner.updatedAt.toISOString(),
  }
}

export async function listOwners(db: SqlServerDatabase): Promise<Owner[]> {
  const rows = await db.getRepository(ownerEntity).find({
    order: {
      lastName: 'ASC',
      firstName: 'ASC',
    },
  })
  return rows.map(mapOwnerRecord)
}

export async function getOwnerById(
  db: SqlServerDatabase,
  id: number,
): Promise<Owner | null> {
  const row = await db.getRepository(ownerEntity).findOne({ where: { id } })
  return row ? mapOwnerRecord(row) : null
}

export async function createOwner(
  db: SqlServerDatabase,
  data: { firstName: string; lastName: string; email: string },
): Promise<PersistedOwner> {
  const repository = db.getRepository(ownerEntity)
  const now = new Date()
  const row = await repository.save(
    repository.create({
      createdAt: now,
      email: data.email,
      firstName: data.firstName,
      lastName: data.lastName,
      updatedAt: now,
    }),
  )
  return mapPersistedOwner(row)
}

export async function updateOwner(
  db: SqlServerDatabase,
  id: number,
  data: { firstName?: string; lastName?: string; email?: string },
): Promise<Owner | null> {
  const repository = db.getRepository(ownerEntity)
  const result = await repository.update(id, {
    ...data,
    updatedAt: new Date(),
  })
  if (!result.affected) {
    return null
  }
  const row = await repository.findOne({ where: { id } })
  return row ? mapOwnerRecord(row) : null
}

export async function deleteOwner(
  db: SqlServerDatabase,
  id: number,
): Promise<boolean> {
  const result = await db.getRepository(ownerEntity).delete(id)
  return (result.affected ?? 0) > 0
}
