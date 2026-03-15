import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import BetterSqlite3 from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { beforeEach, describe, expect, it } from 'vitest'
import * as schema from '@/drizzle/schema'
import {
  createOwner,
  deleteOwner,
  getOwnerById,
  listOwners,
  updateOwner,
} from '@/lib/dal/owners'
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

describe('owners DAL', () => {
  let db: TestDb

  beforeEach(() => {
    ;({ db } = createTestDb())
  })

  describe('listOwners', () => {
    it('returns empty array when no owners exist', async () => {
      const result = await listOwners(db as unknown as AppDatabase)
      expect(result).toEqual([])
    })

    it('returns owners sorted by lastName then firstName', async () => {
      await db.insert(schema.owners).values([
        { firstName: 'Zara', lastName: 'Andersson', email: 'zara@test.com' },
        { firstName: 'Anna', lastName: 'Andersson', email: 'anna@test.com' },
        { firstName: 'Erik', lastName: 'Berg', email: 'erik@test.com' },
      ])
      const result = await listOwners(db as unknown as AppDatabase)
      expect(result).toHaveLength(3)
      expect(result[0].firstName).toBe('Anna')
      expect(result[1].firstName).toBe('Zara')
      expect(result[2].lastName).toBe('Berg')
    })
  })

  describe('getOwnerById', () => {
    it('returns null for non-existent id', async () => {
      const result = await getOwnerById(db as unknown as AppDatabase, 999)
      expect(result).toBeNull()
    })

    it('returns the owner when found', async () => {
      const [inserted] = await db
        .insert(schema.owners)
        .values({ firstName: 'Anna', lastName: 'Svensson', email: 'a@b.com' })
        .returning()
      const result = await getOwnerById(
        db as unknown as AppDatabase,
        inserted.id,
      )
      expect(result).toEqual({
        id: inserted.id,
        firstName: 'Anna',
        lastName: 'Svensson',
        email: 'a@b.com',
      })
    })
  })

  describe('createOwner', () => {
    it('inserts and returns the new owner', async () => {
      const result = await createOwner(db as unknown as AppDatabase, {
        firstName: 'Erik',
        lastName: 'Lindberg',
        email: 'erik@test.com',
      })
      expect(result).toMatchObject({
        firstName: 'Erik',
        lastName: 'Lindberg',
        email: 'erik@test.com',
      })
      expect(result.id).toBeGreaterThan(0)
    })
  })

  describe('updateOwner', () => {
    it('updates fields and returns the owner', async () => {
      const [inserted] = await db
        .insert(schema.owners)
        .values({ firstName: 'Old', lastName: 'Name', email: 'old@test.com' })
        .returning()
      const result = await updateOwner(
        db as unknown as AppDatabase,
        inserted.id,
        {
          firstName: 'New',
          email: 'new@test.com',
        },
      )
      expect(result).toMatchObject({
        id: inserted.id,
        firstName: 'New',
        lastName: 'Name',
        email: 'new@test.com',
      })
    })

    it('returns null for non-existent id', async () => {
      const result = await updateOwner(db as unknown as AppDatabase, 999, {
        firstName: 'X',
      })
      expect(result).toBeNull()
    })
  })

  describe('deleteOwner', () => {
    it('returns true when owner exists', async () => {
      const [inserted] = await db
        .insert(schema.owners)
        .values({ firstName: 'Del', lastName: 'Me', email: 'del@test.com' })
        .returning()
      const result = await deleteOwner(
        db as unknown as AppDatabase,
        inserted.id,
      )
      expect(result).toBe(true)
      const remaining = await listOwners(db as unknown as AppDatabase)
      expect(remaining).toHaveLength(0)
    })

    it('returns false for non-existent id', async () => {
      const result = await deleteOwner(db as unknown as AppDatabase, 999)
      expect(result).toBe(false)
    })
  })
})
