import { requirementCategories } from '@/drizzle/schema'
import type { Database } from '@/lib/db'

export async function listCategories(db: Database) {
  return db.query.requirementCategories.findMany({
    orderBy: [requirementCategories.nameSv],
  })
}
