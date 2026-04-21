import type { SqlServerDatabase } from '@/lib/db'
import {
  type RequirementCategoryEntity,
  requirementCategoryEntity,
} from '@/lib/typeorm/entities'

export interface RequirementCategoryRow {
  id: number
  nameEn: string
  nameSv: string
}

function mapCategory(row: RequirementCategoryEntity): RequirementCategoryRow {
  return {
    id: row.id,
    nameEn: row.nameEn,
    nameSv: row.nameSv,
  }
}

export async function listCategories(
  db: SqlServerDatabase,
): Promise<RequirementCategoryRow[]> {
  const rows = await db
    .getRepository(requirementCategoryEntity)
    .find({ order: { nameSv: 'ASC' } })
  return rows.map(mapCategory)
}
