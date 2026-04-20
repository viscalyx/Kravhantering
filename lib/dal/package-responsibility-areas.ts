import { eq } from 'drizzle-orm'
import { packageResponsibilityAreas } from '@/drizzle/schema'
import {
  isSqlServerDatabaseConnection,
  type AppDatabaseConnection,
} from '@/lib/db'

export async function listPackageResponsibilityAreas(db: AppDatabaseConnection) {
  if (isSqlServerDatabaseConnection(db)) {
    return db.query(`
      SELECT
        id,
        name_sv AS nameSv,
        name_en AS nameEn
      FROM package_responsibility_areas
      ORDER BY name_sv ASC
    `)
  }

  return db.query.packageResponsibilityAreas.findMany({
    orderBy: [packageResponsibilityAreas.nameSv],
  })
}

export async function createPackageResponsibilityArea(
  db: AppDatabaseConnection,
  data: { nameSv: string; nameEn: string },
) {
  if (isSqlServerDatabaseConnection(db)) {
    const rows = await db.query(
      `
        INSERT INTO package_responsibility_areas (name_sv, name_en)
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
    .insert(packageResponsibilityAreas)
    .values(data)
    .returning()
  return row
}

export async function updatePackageResponsibilityArea(
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
          FROM package_responsibility_areas
          WHERE id = @0
        `,
        [id],
      )
      return rows[0]
    }

    params.push(id)
    const rows = await db.query(
      `
        UPDATE package_responsibility_areas
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
    .update(packageResponsibilityAreas)
    .set(data)
    .where(eq(packageResponsibilityAreas.id, id))
    .returning()
  return updated
}

export async function deletePackageResponsibilityArea(
  db: AppDatabaseConnection,
  id: number,
) {
  if (isSqlServerDatabaseConnection(db)) {
    await db.query(`DELETE FROM package_responsibility_areas WHERE id = @0`, [
      id,
    ])
    return
  }

  await db
    .delete(packageResponsibilityAreas)
    .where(eq(packageResponsibilityAreas.id, id))
}
