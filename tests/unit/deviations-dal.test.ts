import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import BetterSqlite3 from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { beforeEach, describe, expect, it } from 'vitest'
import * as schema from '@/drizzle/schema'
import {
  countDeviationsByPackage,
  countDeviationsPerItem,
  countDeviationsPerItemRef,
  createDeviation,
  createPackageLocalDeviation,
  deleteDeviation,
  getDeviation,
  listDeviationsForPackage,
  listDeviationsForPackageItem,
  recordDecision,
  updateDeviation,
} from '@/lib/dal/deviations'
import type { Database as AppDatabase } from '@/lib/db'
import { RequirementsServiceError } from '@/lib/requirements/errors'

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

async function seedRequiredData(db: TestDb) {
  await db.insert(schema.requirementStatuses).values({
    color: '#22c55e',
    id: 3,
    isSystem: true,
    nameEn: 'Published',
    nameSv: 'Publicerad',
    sortOrder: 3,
  })
  await db.insert(schema.requirementAreas).values({
    description: null,
    id: 1,
    name: 'Test Area',
    nextSequence: 2,
    ownerId: null,
    prefix: 'TST',
  })
  await db.insert(schema.requirements).values({
    id: 1,
    requirementAreaId: 1,
    sequenceNumber: 1,
    uniqueId: 'TST-001',
  })
  await db.insert(schema.requirementVersions).values({
    description: 'Test requirement',
    id: 1,
    requirementId: 1,
    requiresTesting: false,
    statusId: 3,
    versionNumber: 1,
  })
  await db.insert(schema.requirementPackages).values({
    id: 1,
    name: 'Test Package',
    uniqueId: 'PKG-001',
  })
  await db.insert(schema.requirementPackageItems).values({
    id: 1,
    packageId: 1,
    requirementId: 1,
    requirementVersionId: 1,
  })
}

describe('deviations DAL', () => {
  let db: TestDb

  beforeEach(() => {
    ;({ db } = createTestDb())
  })

  describe('createDeviation', () => {
    it('creates a deviation and returns its id', async () => {
      await seedRequiredData(db)
      const result = await createDeviation(db as unknown as AppDatabase, {
        packageItemId: 1,
        motivation: 'Cannot meet encryption standard',
        createdBy: 'tester',
      })
      expect(result.id).toBeGreaterThan(0)
    })

    it('throws validation error for empty motivation', async () => {
      await seedRequiredData(db)
      await expect(
        createDeviation(db as unknown as AppDatabase, {
          packageItemId: 1,
          motivation: '  ',
        }),
      ).rejects.toThrow(RequirementsServiceError)
    })

    it('throws not_found for non-existent package item', async () => {
      await seedRequiredData(db)
      await expect(
        createDeviation(db as unknown as AppDatabase, {
          packageItemId: 999,
          motivation: 'Valid motivation',
        }),
      ).rejects.toThrow('Package item 999 not found')
    })
  })

  describe('listDeviationsForPackageItem', () => {
    it('returns empty array when no deviations', async () => {
      await seedRequiredData(db)
      const result = await listDeviationsForPackageItem(
        db as unknown as AppDatabase,
        1,
      )
      expect(result).toEqual([])
    })

    it('returns deviations with joined data', async () => {
      await seedRequiredData(db)
      await createDeviation(db as unknown as AppDatabase, {
        packageItemId: 1,
        motivation: 'Test deviation',
        createdBy: 'tester',
      })
      const result = await listDeviationsForPackageItem(
        db as unknown as AppDatabase,
        1,
      )
      expect(result).toHaveLength(1)
      expect(result[0].motivation).toBe('Test deviation')
      expect(result[0].requirementUniqueId).toBe('TST-001')
      expect(result[0].packageName).toBe('Test Package')
      expect(result[0].decision).toBeNull()
    })
  })

  describe('listDeviationsForPackage', () => {
    it('returns all deviations for a package', async () => {
      await seedRequiredData(db)
      await createDeviation(db as unknown as AppDatabase, {
        packageItemId: 1,
        motivation: 'Deviation A',
      })
      await createDeviation(db as unknown as AppDatabase, {
        packageItemId: 1,
        motivation: 'Deviation B',
      })
      const result = await listDeviationsForPackage(
        db as unknown as AppDatabase,
        1,
      )
      expect(result).toHaveLength(2)
    })
  })

  describe('getDeviation', () => {
    it('returns a deviation by id', async () => {
      await seedRequiredData(db)
      const { id } = await createDeviation(db as unknown as AppDatabase, {
        packageItemId: 1,
        motivation: 'Single deviation',
      })
      const deviation = await getDeviation(db as unknown as AppDatabase, id)
      expect(deviation.motivation).toBe('Single deviation')
      expect(deviation.id).toBe(id)
    })

    it('throws not_found for missing deviation', async () => {
      await seedRequiredData(db)
      await expect(
        getDeviation(db as unknown as AppDatabase, 999),
      ).rejects.toThrow('Deviation 999 not found')
    })
  })

  describe('updateDeviation', () => {
    it('updates motivation before decision', async () => {
      await seedRequiredData(db)
      const { id } = await createDeviation(db as unknown as AppDatabase, {
        packageItemId: 1,
        motivation: 'Original',
      })
      await updateDeviation(db as unknown as AppDatabase, id, {
        motivation: 'Updated motivation',
      })
      const deviation = await getDeviation(db as unknown as AppDatabase, id)
      expect(deviation.motivation).toBe('Updated motivation')
    })

    it('throws conflict when deviation has a decision', async () => {
      await seedRequiredData(db)
      const { id } = await createDeviation(db as unknown as AppDatabase, {
        packageItemId: 1,
        motivation: 'Decided upon',
      })
      await recordDecision(db as unknown as AppDatabase, id, {
        decision: 1,
        decisionMotivation: 'Approved for reason',
        decidedBy: 'approver',
      })
      await expect(
        updateDeviation(db as unknown as AppDatabase, id, {
          motivation: 'Too late',
        }),
      ).rejects.toThrow(
        'Cannot edit a deviation after a decision has been recorded',
      )
    })
  })

  describe('recordDecision', () => {
    it('records an approval decision', async () => {
      await seedRequiredData(db)
      const { id } = await createDeviation(db as unknown as AppDatabase, {
        packageItemId: 1,
        motivation: 'Needs approval',
      })
      await recordDecision(db as unknown as AppDatabase, id, {
        decision: 1,
        decisionMotivation: 'Risk accepted',
        decidedBy: 'manager',
      })
      const deviation = await getDeviation(db as unknown as AppDatabase, id)
      expect(deviation.decision).toBe(1)
      expect(deviation.decisionMotivation).toBe('Risk accepted')
      expect(deviation.decidedBy).toBe('manager')
      expect(deviation.decidedAt).toBeTruthy()
    })

    it('records a rejection decision', async () => {
      await seedRequiredData(db)
      const { id } = await createDeviation(db as unknown as AppDatabase, {
        packageItemId: 1,
        motivation: 'Needs rejection',
      })
      await recordDecision(db as unknown as AppDatabase, id, {
        decision: 2,
        decisionMotivation: 'Risk not acceptable',
        decidedBy: 'manager',
      })
      const deviation = await getDeviation(db as unknown as AppDatabase, id)
      expect(deviation.decision).toBe(2)
    })

    it('throws validation for invalid decision value', async () => {
      await seedRequiredData(db)
      const { id } = await createDeviation(db as unknown as AppDatabase, {
        packageItemId: 1,
        motivation: 'Invalid decision',
      })
      await expect(
        recordDecision(db as unknown as AppDatabase, id, {
          decision: 5,
          decisionMotivation: 'N/A',
          decidedBy: 'anyone',
        }),
      ).rejects.toThrow('Decision must be 1 (approved) or 2 (rejected)')
    })

    it('throws conflict when decision already exists', async () => {
      await seedRequiredData(db)
      const { id } = await createDeviation(db as unknown as AppDatabase, {
        packageItemId: 1,
        motivation: 'Double decision',
      })
      await recordDecision(db as unknown as AppDatabase, id, {
        decision: 1,
        decisionMotivation: 'First decision',
        decidedBy: 'manager',
      })
      await expect(
        recordDecision(db as unknown as AppDatabase, id, {
          decision: 2,
          decisionMotivation: 'Second attempt',
          decidedBy: 'other',
        }),
      ).rejects.toThrow(
        'A decision has already been recorded for this deviation',
      )
    })
  })

  describe('deleteDeviation', () => {
    it('deletes a deviation without decision', async () => {
      await seedRequiredData(db)
      const { id } = await createDeviation(db as unknown as AppDatabase, {
        packageItemId: 1,
        motivation: 'Delete me',
      })
      await deleteDeviation(db as unknown as AppDatabase, id)
      await expect(
        getDeviation(db as unknown as AppDatabase, id),
      ).rejects.toThrow(`Deviation ${id} not found`)
    })

    it('throws conflict when deviation has decision', async () => {
      await seedRequiredData(db)
      const { id } = await createDeviation(db as unknown as AppDatabase, {
        packageItemId: 1,
        motivation: 'Has decision',
      })
      await recordDecision(db as unknown as AppDatabase, id, {
        decision: 1,
        decisionMotivation: 'Approved',
        decidedBy: 'manager',
      })
      await expect(
        deleteDeviation(db as unknown as AppDatabase, id),
      ).rejects.toThrow(
        'Cannot delete a deviation after a decision has been recorded',
      )
    })
  })

  describe('countDeviationsByPackage', () => {
    it('returns zero counts for empty package', async () => {
      await seedRequiredData(db)
      const counts = await countDeviationsByPackage(
        db as unknown as AppDatabase,
        1,
      )
      expect(counts).toEqual({
        total: 0,
        pending: 0,
        approved: 0,
        rejected: 0,
      })
    })

    it('returns correct counts by decision status', async () => {
      await seedRequiredData(db)
      // Create 3 deviations
      const { id: id1 } = await createDeviation(db as unknown as AppDatabase, {
        packageItemId: 1,
        motivation: 'Dev A',
      })
      const { id: id2 } = await createDeviation(db as unknown as AppDatabase, {
        packageItemId: 1,
        motivation: 'Dev B',
      })
      await createDeviation(db as unknown as AppDatabase, {
        packageItemId: 1,
        motivation: 'Dev C',
      })
      // Approve first, reject second, leave third pending
      await recordDecision(db as unknown as AppDatabase, id1, {
        decision: 1,
        decisionMotivation: 'OK',
        decidedBy: 'mgr',
      })
      await recordDecision(db as unknown as AppDatabase, id2, {
        decision: 2,
        decisionMotivation: 'Not OK',
        decidedBy: 'mgr',
      })

      const counts = await countDeviationsByPackage(
        db as unknown as AppDatabase,
        1,
      )
      expect(counts).toEqual({
        total: 3,
        pending: 1,
        approved: 1,
        rejected: 1,
      })
    })
  })

  describe('countDeviationsPerItem', () => {
    it('returns a map of item deviation counts', async () => {
      await seedRequiredData(db)
      await createDeviation(db as unknown as AppDatabase, {
        packageItemId: 1,
        motivation: 'Item deviation',
      })
      const map = await countDeviationsPerItem(db as unknown as AppDatabase, 1)
      expect(map.get(1)).toEqual({ total: 1, pending: 1, approved: 0 })
    })

    it('returns empty map when no deviations', async () => {
      await seedRequiredData(db)
      const map = await countDeviationsPerItem(db as unknown as AppDatabase, 1)
      expect(map.size).toBe(0)
    })
  })

  async function seedWithLocalRequirement(testDb: TestDb) {
    await seedRequiredData(testDb)
    await testDb.insert(schema.packageLocalRequirements).values({
      id: 1,
      packageId: 1,
      uniqueId: 'PKG-L-001',
      sequenceNumber: 1,
      description: 'Local requirement',
    })
  }

  describe('listDeviationsForPackage (mixed sources)', () => {
    it('returns library and local deviations sorted by uniqueId', async () => {
      await seedWithLocalRequirement(db)
      await createDeviation(db as unknown as AppDatabase, {
        packageItemId: 1,
        motivation: 'Library deviation',
      })
      await createPackageLocalDeviation(db as unknown as AppDatabase, {
        packageLocalRequirementId: 1,
        motivation: 'Local deviation',
      })

      const result = await listDeviationsForPackage(
        db as unknown as AppDatabase,
        1,
      )
      expect(result).toHaveLength(2)
      expect(result[0].isPackageLocal).toBe(true)
      expect(result[0].motivation).toBe('Local deviation')
      expect(result[0].itemRef).toBe('local:1')
      expect(result[1].isPackageLocal).toBe(false)
      expect(result[1].motivation).toBe('Library deviation')
      expect(result[1].itemRef).toBe('lib:1')
      expect(result[1].packageLocalRequirementId).toBeNull()
    })

    it('sorts by requirementUniqueId then createdAt', async () => {
      await seedWithLocalRequirement(db)
      await createPackageLocalDeviation(db as unknown as AppDatabase, {
        packageLocalRequirementId: 1,
        motivation: 'Local first',
      })
      await createDeviation(db as unknown as AppDatabase, {
        packageItemId: 1,
        motivation: 'Library first',
      })
      await createDeviation(db as unknown as AppDatabase, {
        packageItemId: 1,
        motivation: 'Library second',
      })

      const result = await listDeviationsForPackage(
        db as unknown as AppDatabase,
        1,
      )
      expect(result).toHaveLength(3)
      expect(result.map(r => r.requirementUniqueId)).toEqual([
        'PKG-L-001',
        'TST-001',
        'TST-001',
      ])
      expect(result[1].motivation).toBe('Library first')
      expect(result[2].motivation).toBe('Library second')
    })
  })

  describe('countDeviationsPerItemRef', () => {
    it('returns counts for both library and local deviations', async () => {
      await seedWithLocalRequirement(db)
      await createDeviation(db as unknown as AppDatabase, {
        packageItemId: 1,
        motivation: 'Library deviation',
      })
      await createPackageLocalDeviation(db as unknown as AppDatabase, {
        packageLocalRequirementId: 1,
        motivation: 'Local deviation',
      })

      const map = await countDeviationsPerItemRef(
        db as unknown as AppDatabase,
        1,
      )
      expect(map.size).toBe(2)
      expect(map.get('lib:1')).toEqual({
        total: 1,
        pending: 1,
        approved: 0,
      })
      expect(map.get('local:1')).toEqual({
        total: 1,
        pending: 1,
        approved: 0,
      })
    })

    it('returns empty map when no deviations', async () => {
      await seedWithLocalRequirement(db)
      const map = await countDeviationsPerItemRef(
        db as unknown as AppDatabase,
        1,
      )
      expect(map.size).toBe(0)
    })
  })
})
