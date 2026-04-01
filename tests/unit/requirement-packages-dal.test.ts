import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import BetterSqlite3 from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { beforeEach, describe, expect, it } from 'vitest'
import * as schema from '@/drizzle/schema'
import {
  createPackage,
  deletePackage,
  getPackageById,
  listPackages,
  updatePackage,
} from '@/lib/dal/requirement-packages'
import type { Database as AppDatabase } from '@/lib/db'

function createTestDb() {
  const sqlite = new BetterSqlite3(':memory:')
  const migrationsDir = join(process.cwd(), 'drizzle/migrations')
  const sqlFiles = readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort()
  for (const file of sqlFiles) {
    const sql = readFileSync(join(migrationsDir, file), 'utf8')
    for (const statement of sql.split('--> statement-breakpoint')) {
      const s = statement.trim()
      if (s) sqlite.exec(s)
    }
  }
  const db = drizzle(sqlite, { schema })
  return { db, sqlite }
}

type TestDb = ReturnType<typeof createTestDb>['db']

describe('requirement-packages DAL', () => {
  let db: TestDb

  beforeEach(() => {
    ;({ db } = createTestDb())
  })

  it('listPackages returns empty when no packages', async () => {
    const result = await listPackages(db as unknown as AppDatabase)
    expect(result).toEqual([])
  })

  it('createPackage and getPackageById', async () => {
    const pkg = await createPackage(db as unknown as AppDatabase, {
      name: 'Säkerhetspaket',
      uniqueId: 'SAKERHETSPAKET',
    })
    expect(pkg).toMatchObject({ name: 'Säkerhetspaket' })

    const found = await getPackageById(db as unknown as AppDatabase, pkg.id)
    expect(found).toBeTruthy()
  })

  it('updatePackage changes fields', async () => {
    const pkg = await createPackage(db as unknown as AppDatabase, {
      name: 'Gammal',
      uniqueId: 'GAMMAL',
    })

    const updated = await updatePackage(db as unknown as AppDatabase, pkg.id, {
      name: 'New',
    })
    expect(updated).toMatchObject({ name: 'New' })
  })

  it('deletePackage removes package', async () => {
    const pkg = await createPackage(db as unknown as AppDatabase, {
      name: 'Tmp',
      uniqueId: 'TMP',
    })

    await deletePackage(db as unknown as AppDatabase, pkg.id)
    const result = await listPackages(db as unknown as AppDatabase)
    expect(result).toEqual([])
  })
})
