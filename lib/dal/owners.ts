import { eq } from 'drizzle-orm'
import { owners } from '@/drizzle/schema'
import type { Database } from '@/lib/db'
import { ownerEntity, type OwnerEntity } from '@/lib/typeorm/entities'

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

interface OwnerTypeOrmRepository {
  create(data: Partial<OwnerEntity>): OwnerEntity
  delete(id: number): Promise<{ affected?: number | null }>
  find(options: {
    order: {
      firstName: 'ASC' | 'DESC'
      lastName: 'ASC' | 'DESC'
    }
  }): Promise<OwnerEntity[]>
  findOne(options: { where: { id: number } }): Promise<OwnerEntity | null>
  save(entity: OwnerEntity): Promise<OwnerEntity>
  update(
    id: number,
    data: Partial<OwnerEntity>,
  ): Promise<{ affected?: number | null }>
}

interface TypeOrmRepositorySource {
  getRepository(target: typeof ownerEntity): OwnerTypeOrmRepository
}

type OwnerDatabase = Database | TypeOrmRepositorySource

function isTypeOrmRepositorySource(
  db: OwnerDatabase,
): db is TypeOrmRepositorySource {
  return (
    typeof db === 'object' &&
    db !== null &&
    'getRepository' in db &&
    typeof db.getRepository === 'function'
  )
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

function getOwnerRepository(
  db: TypeOrmRepositorySource,
): OwnerTypeOrmRepository {
  return db.getRepository(ownerEntity)
}

export async function listOwners(db: OwnerDatabase): Promise<Owner[]> {
  if (isTypeOrmRepositorySource(db)) {
    const rows = await getOwnerRepository(db).find({
      order: {
        lastName: 'ASC',
        firstName: 'ASC',
      },
    })
    return rows.map(mapOwnerRecord)
  }

  const rows = await db.query.owners.findMany({
    orderBy: [owners.lastName, owners.firstName],
  })
  return rows.map(mapOwnerRecord)
}

export async function getOwnerById(
  db: OwnerDatabase,
  id: number,
): Promise<Owner | null> {
  if (isTypeOrmRepositorySource(db)) {
    const row = await getOwnerRepository(db).findOne({
      where: { id },
    })
    return row ? mapOwnerRecord(row) : null
  }

  const row = await db.query.owners.findFirst({
    where: eq(owners.id, id),
  })
  return row ? mapOwnerRecord(row) : null
}

export async function createOwner(
  db: OwnerDatabase,
  data: { firstName: string; lastName: string; email: string },
): Promise<PersistedOwner> {
  if (isTypeOrmRepositorySource(db)) {
    const repository = getOwnerRepository(db)
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

  const [row] = await db
    .insert(owners)
    .values({
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
    })
    .returning()
  return {
    createdAt: row.createdAt,
    email: row.email,
    firstName: row.firstName,
    id: row.id,
    lastName: row.lastName,
    updatedAt: row.updatedAt,
  }
}

export async function updateOwner(
  db: OwnerDatabase,
  id: number,
  data: { firstName?: string; lastName?: string; email?: string },
): Promise<Owner | null> {
  if (isTypeOrmRepositorySource(db)) {
    const repository = getOwnerRepository(db)
    const result = await repository.update(id, {
      ...data,
      updatedAt: new Date(),
    })

    if (!result.affected) {
      return null
    }

    const row = await repository.findOne({
      where: { id },
    })
    return row ? mapOwnerRecord(row) : null
  }

  const rows = await db
    .update(owners)
    .set({
      ...data,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(owners.id, id))
    .returning()
  if (!rows[0]) return null
  return mapOwnerRecord(rows[0])
}

export async function deleteOwner(
  db: OwnerDatabase,
  id: number,
): Promise<boolean> {
  if (isTypeOrmRepositorySource(db)) {
    const result = await getOwnerRepository(db).delete(id)
    return (result.affected ?? 0) > 0
  }

  const rows = await db.delete(owners).where(eq(owners.id, id)).returning()
  return rows.length > 0
}
