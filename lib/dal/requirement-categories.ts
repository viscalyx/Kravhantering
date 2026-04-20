import { requirementCategories } from '@/drizzle/schema'
import {
  isSqlServerDatabaseConnection,
  type AppDatabaseConnection,
} from '@/lib/db'

export interface RequirementCategoryRow {
  id: number
  nameEn: string
  nameSv: string
}

export async function listCategories(
  db: AppDatabaseConnection,
): Promise<RequirementCategoryRow[]> {
  if (isSqlServerDatabaseConnection(db)) {
    return db.query(`
      SELECT
        id,
        name_sv AS nameSv,
        name_en AS nameEn
      FROM requirement_categories
      ORDER BY name_sv ASC
    `)
  }

  return db.query.requirementCategories.findMany({
    orderBy: [requirementCategories.nameSv],
  })
}
