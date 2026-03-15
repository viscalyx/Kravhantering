import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import BetterSqlite3 from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { beforeEach, describe, expect, it } from 'vitest'
import * as schema from '@/drizzle/schema'
import {
  createQualityCharacteristic,
  createType,
  deleteQualityCharacteristic,
  deleteType,
  listQualityCharacteristics,
  listTypes,
  updateQualityCharacteristic,
  updateType,
} from '@/lib/dal/requirement-types'
import type { Database as AppDatabase } from '@/lib/db'

function createTestDb() {
  const sqlite = new BetterSqlite3(':memory:')
  const migDir = join(process.cwd(), 'drizzle', 'migrations')
  const files = readdirSync(migDir)
    .filter(f => f.endsWith('.sql'))
    .sort()
  for (const f of files) {
    const sql = readFileSync(join(migDir, f), 'utf-8')
    for (const statement of sql.split('--> statement-breakpoint')) {
      const s = statement.trim()
      if (s) sqlite.exec(s)
    }
  }
  return drizzle(sqlite, { schema }) as unknown as AppDatabase
}

describe('requirement-types DAL', () => {
  let db: AppDatabase

  beforeEach(() => {
    db = createTestDb()
  })

  describe('createType', () => {
    it('creates a type and returns it', async () => {
      const t = await createType(db, {
        nameSv: 'Funktionella',
        nameEn: 'Functional',
      })
      expect(t.id).toBeDefined()
      expect(t.nameSv).toBe('Funktionella')
      expect(t.nameEn).toBe('Functional')
    })
  })

  describe('listTypes', () => {
    it('returns types ordered by nameSv with categories', async () => {
      const t1 = await createType(db, {
        nameSv: 'B-typ',
        nameEn: 'B-type',
      })
      await createType(db, {
        nameSv: 'A-typ',
        nameEn: 'A-type',
      })
      // Add a category to t1
      await db.insert(schema.qualityCharacteristics).values({
        nameSv: 'Kat',
        nameEn: 'Cat',
        requirementTypeId: t1.id,
      })

      const list = await listTypes(db)
      expect(list.length).toBe(2)
      // ordered by nameSv: A-typ before B-typ
      expect(list[0].nameEn).toBe('A-type')
      expect(list[1].nameEn).toBe('B-type')
      expect(list[1].qualityCharacteristics.length).toBe(1)
    })
  })

  describe('listQualityCharacteristics', () => {
    it('returns all categories when no typeId given', async () => {
      const t = await createType(db, {
        nameSv: 'Typ',
        nameEn: 'Type',
      })
      await db.insert(schema.qualityCharacteristics).values([
        { nameSv: 'K1', nameEn: 'C1', requirementTypeId: t.id },
        { nameSv: 'K2', nameEn: 'C2', requirementTypeId: t.id },
      ])
      const cats = await listQualityCharacteristics(db)
      expect(cats.length).toBe(2)
    })

    it('filters by typeId', async () => {
      const t1 = await createType(db, {
        nameSv: 'T1',
        nameEn: 'T1e',
      })
      const t2 = await createType(db, {
        nameSv: 'T2',
        nameEn: 'T2e',
      })
      await db.insert(schema.qualityCharacteristics).values([
        { nameSv: 'A', nameEn: 'A', requirementTypeId: t1.id },
        { nameSv: 'B', nameEn: 'B', requirementTypeId: t2.id },
      ])
      const cats = await listQualityCharacteristics(db, t1.id)
      expect(cats.length).toBe(1)
      expect(cats[0].nameEn).toBe('A')
    })
  })

  describe('updateType', () => {
    it('updates a type and returns updated row', async () => {
      const t = await createType(db, {
        nameSv: 'Orig',
        nameEn: 'Orig',
      })
      const updated = await updateType(db, t.id, { nameSv: 'Ny' })
      expect(updated.nameSv).toBe('Ny')
      expect(updated.nameEn).toBe('Orig')
    })
  })

  describe('deleteType', () => {
    it('removes the type', async () => {
      const t = await createType(db, {
        nameSv: 'Del',
        nameEn: 'Del',
      })
      await deleteType(db, t.id)
      const list = await listTypes(db)
      expect(list.length).toBe(0)
    })
  })

  describe('createQualityCharacteristic', () => {
    it('creates a quality characteristic and returns it', async () => {
      const t = await createType(db, { nameSv: 'Typ', nameEn: 'Type' })
      const qc = await createQualityCharacteristic(db, {
        nameSv: 'Säkerhet',
        nameEn: 'Security',
        requirementTypeId: t.id,
      })
      expect(qc.id).toBeDefined()
      expect(qc.nameSv).toBe('Säkerhet')
      expect(qc.nameEn).toBe('Security')
      expect(qc.requirementTypeId).toBe(t.id)
      expect(qc.parentId).toBeNull()
    })

    it('creates a child characteristic with parentId', async () => {
      const t = await createType(db, { nameSv: 'Typ', nameEn: 'Type' })
      const parent = await createQualityCharacteristic(db, {
        nameSv: 'Förälder',
        nameEn: 'Parent',
        requirementTypeId: t.id,
      })
      const child = await createQualityCharacteristic(db, {
        nameSv: 'Barn',
        nameEn: 'Child',
        requirementTypeId: t.id,
        parentId: parent.id,
      })
      expect(child.parentId).toBe(parent.id)
    })
  })

  describe('updateQualityCharacteristic', () => {
    it('updates and returns the updated row', async () => {
      const t = await createType(db, { nameSv: 'Typ', nameEn: 'Type' })
      const qc = await createQualityCharacteristic(db, {
        nameSv: 'Orig',
        nameEn: 'Orig',
        requirementTypeId: t.id,
      })
      const updated = await updateQualityCharacteristic(db, qc.id, {
        nameSv: 'Ny',
      })
      expect(updated?.nameSv).toBe('Ny')
      expect(updated?.nameEn).toBe('Orig')
    })

    it('returns null for non-existent id', async () => {
      const result = await updateQualityCharacteristic(db, 9999, {
        nameSv: 'X',
      })
      expect(result).toBeNull()
    })
  })

  describe('deleteQualityCharacteristic', () => {
    it('deletes an existing characteristic and returns true', async () => {
      const t = await createType(db, { nameSv: 'Typ', nameEn: 'Type' })
      const qc = await createQualityCharacteristic(db, {
        nameSv: 'Del',
        nameEn: 'Del',
        requirementTypeId: t.id,
      })
      const result = await deleteQualityCharacteristic(db, qc.id)
      expect(result).toBe(true)
      const list = await listQualityCharacteristics(db)
      expect(list.length).toBe(0)
    })

    it('returns false for non-existent id', async () => {
      const result = await deleteQualityCharacteristic(db, 9999)
      expect(result).toBe(false)
    })
  })
})
