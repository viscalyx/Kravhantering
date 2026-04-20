import { eq } from 'drizzle-orm'
import { packageImplementationTypes } from '@/drizzle/schema'
import {
  isSqlServerDatabaseConnection,
  type AppDatabaseConnection,
} from '@/lib/db'

export async function listPackageImplementationTypes(db: AppDatabaseConnection) {
  if (isSqlServerDatabaseConnection(db)) {
    return db.query(`
      SELECT
        id,
        name_sv AS nameSv,
        name_en AS nameEn
      FROM package_implementation_types
      ORDER BY name_sv ASC
    `)
  }

  return db.query.packageImplementationTypes.findMany({
    orderBy: [packageImplementationTypes.nameSv],
  })
}

export async function createPackageImplementationType(
  db: AppDatabaseConnection,
  data: { nameSv: string; nameEn: string },
) {
  if (isSqlServerDatabaseConnection(db)) {
    const rows = await db.query(
      `
        INSERT INTO package_implementation_types (name_sv, name_en)
        OUTPUT
          inserted.id AS id,
          inserted.name_sv AS nameSv,
          inserted.name_en AS nameEn
        VALUES (@0, @1)
      `,
      [data.nameSv, data.nameEn],
    )
    return rows[0]
  }

  const [row] = await db
    .insert(packageImplementationTypes)
    .values(data)
    .returning()
  return row
}

export async function updatePackageImplementationType(
  db: AppDatabaseConnection,
  id: number,
  data: { nameSv?: string; nameEn?: string },
) {
  if (isSqlServerDatabaseConnection(db)) {
    const sets = []
    const params = []

    if (data.nameSv !== undefined) {
      params.push(data.nameSv)
      sets.push(`name_sv = @${params.length - 1}`)
    }

    if (data.nameEn !== undefined) {
      params.push(data.nameEn)
      sets.push(`name_en = @${params.length - 1}`)
    }

    if (sets.length === 0) {
      const rows = await db.query(
        `
          SELECT
            id,
            name_sv AS nameSv,
            name_en AS nameEn
          FROM package_implementation_types
          WHERE id = @0
        `,
        [id],
      )
      return rows[0]
    }

    params.push(id)
    const rows = await db.query(
      `
        UPDATE package_implementation_types
        SET ${sets.join(', ')}
        OUTPUT
          inserted.id AS id,
          inserted.name_sv AS nameSv,
          inserted.name_en AS nameEn
        WHERE id = @${params.length - 1}
      `,
      params,
    )
    return rows[0]
  }

  const [updated] = await db
    .update(packageImplementationTypes)
    .set(data)
    .where(eq(packageImplementationTypes.id, id))
    .returning()
  return updated
}

export async function deletePackageImplementationType(
  db: AppDatabaseConnection,
  id: number,
) {
  if (isSqlServerDatabaseConnection(db)) {
    await db.query(`DELETE FROM package_implementation_types WHERE id = @0`, [
      id,
    ])
    return
  }

  await db
    .delete(packageImplementationTypes)
    .where(eq(packageImplementationTypes.id, id))
}
