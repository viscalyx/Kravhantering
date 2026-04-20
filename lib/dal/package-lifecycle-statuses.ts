import { eq } from 'drizzle-orm'
import { packageLifecycleStatuses } from '@/drizzle/schema'
import {
  isSqlServerDatabaseConnection,
  type AppDatabaseConnection,
} from '@/lib/db'

export async function listPackageLifecycleStatuses(db: AppDatabaseConnection) {
  if (isSqlServerDatabaseConnection(db)) {
    return db.query(`
      SELECT
        id,
        name_sv AS nameSv,
        name_en AS nameEn
      FROM package_lifecycle_statuses
      ORDER BY name_sv ASC
    `)
  }

  return db.query.packageLifecycleStatuses.findMany({
    orderBy: [packageLifecycleStatuses.nameSv],
  })
}

export async function createPackageLifecycleStatus(
  db: AppDatabaseConnection,
  data: { nameSv: string; nameEn: string },
) {
  const nameSv = data.nameSv.trim()
  const nameEn = data.nameEn.trim()
  if (!nameSv || !nameEn) {
    throw new Error('nameSv and nameEn are required')
  }

  if (isSqlServerDatabaseConnection(db)) {
    const rows = await db.query(
      `
        INSERT INTO package_lifecycle_statuses (name_sv, name_en)
        OUTPUT
          inserted.id AS id,
          inserted.name_sv AS nameSv,
          inserted.name_en AS nameEn
        VALUES (@0, @1)
      `,
      [nameSv, nameEn],
    )
    return rows[0]
  }

  const [row] = await db
    .insert(packageLifecycleStatuses)
    .values({ nameSv, nameEn })
    .returning()
  return row
}

export async function updatePackageLifecycleStatus(
  db: AppDatabaseConnection,
  id: number,
  data: { nameSv?: string; nameEn?: string },
) {
  const trimmed: { nameSv?: string; nameEn?: string } = {}
  if (data.nameSv !== undefined) {
    const v = data.nameSv.trim()
    if (!v) throw new Error('nameSv must not be empty')
    trimmed.nameSv = v
  }
  if (data.nameEn !== undefined) {
    const v = data.nameEn.trim()
    if (!v) throw new Error('nameEn must not be empty')
    trimmed.nameEn = v
  }

  if (isSqlServerDatabaseConnection(db)) {
    const sets = []
    const params = []

    if (trimmed.nameSv !== undefined) {
      params.push(trimmed.nameSv)
      sets.push(`name_sv = @${params.length - 1}`)
    }

    if (trimmed.nameEn !== undefined) {
      params.push(trimmed.nameEn)
      sets.push(`name_en = @${params.length - 1}`)
    }

    if (sets.length === 0) {
      const rows = await db.query(
        `
          SELECT
            id,
            name_sv AS nameSv,
            name_en AS nameEn
          FROM package_lifecycle_statuses
          WHERE id = @0
        `,
        [id],
      )
      return rows[0]
    }

    params.push(id)
    const rows = await db.query(
      `
        UPDATE package_lifecycle_statuses
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
    .update(packageLifecycleStatuses)
    .set(trimmed)
    .where(eq(packageLifecycleStatuses.id, id))
    .returning()
  return updated
}

export async function deletePackageLifecycleStatus(
  db: AppDatabaseConnection,
  id: number,
) {
  if (isSqlServerDatabaseConnection(db)) {
    const rows = await db.query(
      `
        DELETE FROM package_lifecycle_statuses
        OUTPUT deleted.id AS id
        WHERE id = @0
      `,
      [id],
    )
    return rows.length
  }

  const result = await db
    .delete(packageLifecycleStatuses)
    .where(eq(packageLifecycleStatuses.id, id))
    .returning()
  return result.length
}
