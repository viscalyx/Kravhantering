import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import BetterSqlite3 from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { beforeEach, describe, expect, it } from 'vitest'
import * as schema from '@/drizzle/schema'
import {
  approveArchiving,
  cancelArchiving,
  createRequirement,
  deleteDraftVersion,
  editRequirement,
  getRequirementById,
  getRequirementByUniqueId,
  getVersionHistory,
  initiateArchiving,
  reactivateRequirement,
  restoreVersion,
  transitionStatus,
} from '@/lib/dal/requirements'
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
type Db = AppDatabase

async function seedStatuses(db: TestDb) {
  await db.insert(schema.requirementStatuses).values([
    {
      id: 1,
      nameEn: 'Draft',
      nameSv: 'Utkast',
      sortOrder: 1,
      color: 'blue',
      isSystem: true,
    },
    {
      id: 2,
      nameEn: 'Review',
      nameSv: 'Granskning',
      sortOrder: 2,
      color: 'yellow',
      isSystem: true,
    },
    {
      id: 3,
      nameEn: 'Published',
      nameSv: 'Publicerad',
      sortOrder: 3,
      color: 'green',
      isSystem: true,
    },
    {
      id: 4,
      nameEn: 'Archived',
      nameSv: 'Arkiverad',
      sortOrder: 4,
      color: 'gray',
      isSystem: true,
    },
  ])
  await db.insert(schema.requirementStatusTransitions).values([
    { fromStatusId: 1, toStatusId: 2 }, // Draft → Review
    { fromStatusId: 2, toStatusId: 1 }, // Review → Draft
    { fromStatusId: 2, toStatusId: 3 }, // Review → Published
    { fromStatusId: 3, toStatusId: 2 }, // Published → Review (initiate archiving)
    { fromStatusId: 2, toStatusId: 4 }, // Review → Archived (approve archiving)
  ])
}

async function seedArea(db: TestDb) {
  const [area] = await db
    .insert(schema.requirementAreas)
    .values({ prefix: 'TST', name: 'Test Area', nextSequence: 1 })
    .returning()
  return area
}

describe('requirements DAL – CRUD & lifecycle', () => {
  let db: TestDb

  beforeEach(() => {
    ;({ db } = createTestDb())
  })

  describe('createRequirement', () => {
    it('creates requirement with first draft version', async () => {
      await seedStatuses(db)
      const area = await seedArea(db)

      const result = await createRequirement(db as unknown as Db, {
        requirementAreaId: area.id,
        description: 'Test requirement',
      })

      expect(result.requirement.uniqueId).toBe('TST0001')
      expect(result.version.versionNumber).toBe(1)
      expect(result.version.statusId).toBe(1)
    })

    it('auto-increments sequence number', async () => {
      await seedStatuses(db)
      const area = await seedArea(db)

      const r1 = await createRequirement(db as unknown as Db, {
        requirementAreaId: area.id,
        description: 'First',
      })
      const r2 = await createRequirement(db as unknown as Db, {
        requirementAreaId: area.id,
        description: 'Second',
      })

      expect(r1.requirement.uniqueId).toBe('TST0001')
      expect(r2.requirement.uniqueId).toBe('TST0002')
    })

    it('throws when area not found', async () => {
      await seedStatuses(db)
      await expect(
        createRequirement(db as unknown as Db, {
          requirementAreaId: 999,
          description: 'Test',
        }),
      ).rejects.toThrow('area not found')
    })

    it('links scenarios', async () => {
      await seedStatuses(db)
      const area = await seedArea(db)
      const [scenario] = await db
        .insert(schema.usageScenarios)
        .values({ nameSv: 'Scen', nameEn: 'Scene' })
        .returning()

      const result = await createRequirement(db as unknown as Db, {
        requirementAreaId: area.id,
        description: 'With scenario',
        scenarioIds: [scenario.id],
      })

      const full = await getRequirementById(
        db as unknown as Db,
        result.requirement.id,
      )
      expect(full?.versions[0].versionScenarios).toHaveLength(1)
    })
  })

  describe('getRequirementById / getRequirementByUniqueId', () => {
    it('returns null for non-existent', async () => {
      const result = await getRequirementById(db as unknown as Db, 999)
      expect(result).toBeNull()
    })

    it('returns requirement with versions', async () => {
      await seedStatuses(db)
      const area = await seedArea(db)
      const { requirement } = await createRequirement(db as unknown as Db, {
        requirementAreaId: area.id,
        description: 'Test',
      })

      const result = await getRequirementById(
        db as unknown as Db,
        requirement.id,
      )
      expect(result?.uniqueId).toBe('TST0001')
      expect(result?.versions).toHaveLength(1)
    })

    it('finds by uniqueId', async () => {
      await seedStatuses(db)
      const area = await seedArea(db)
      await createRequirement(db as unknown as Db, {
        requirementAreaId: area.id,
        description: 'Unique test',
      })

      const result = await getRequirementByUniqueId(
        db as unknown as Db,
        'TST0001',
      )
      expect(result?.versions[0].description).toBe('Unique test')
    })

    it('returns null for missing uniqueId', async () => {
      const result = await getRequirementByUniqueId(db as unknown as Db, 'NOPE')
      expect(result).toBeNull()
    })
  })

  describe('editRequirement', () => {
    it('updates draft in place', async () => {
      await seedStatuses(db)
      const area = await seedArea(db)
      const { requirement } = await createRequirement(db as unknown as Db, {
        requirementAreaId: area.id,
        description: 'Original',
      })

      const updated = await editRequirement(
        db as unknown as Db,
        requirement.id,
        { description: 'Updated' },
      )
      expect(updated.description).toBe('Updated')
    })

    it('creates new draft when editing published', async () => {
      await seedStatuses(db)
      const area = await seedArea(db)
      const { requirement } = await createRequirement(db as unknown as Db, {
        requirementAreaId: area.id,
        description: 'V1',
      })

      await transitionStatus(db as unknown as Db, requirement.id, 2)
      await transitionStatus(db as unknown as Db, requirement.id, 3)

      const v2 = await editRequirement(db as unknown as Db, requirement.id, {
        description: 'V2',
      })
      expect(v2.versionNumber).toBe(2)
      expect(v2.statusId).toBe(1)
    })

    it('throws when editing review', async () => {
      await seedStatuses(db)
      const area = await seedArea(db)
      const { requirement } = await createRequirement(db as unknown as Db, {
        requirementAreaId: area.id,
        description: 'V1',
      })
      await transitionStatus(db as unknown as Db, requirement.id, 2)
      await expect(
        editRequirement(db as unknown as Db, requirement.id, {
          description: 'Nope',
        }),
      ).rejects.toThrow('Review')
    })

    it('throws when editing archived', async () => {
      await seedStatuses(db)
      const area = await seedArea(db)
      const { requirement } = await createRequirement(db as unknown as Db, {
        requirementAreaId: area.id,
        description: 'V1',
      })
      await transitionStatus(db as unknown as Db, requirement.id, 2)
      await transitionStatus(db as unknown as Db, requirement.id, 3)
      await initiateArchiving(db as unknown as Db, requirement.id)
      await approveArchiving(db as unknown as Db, requirement.id)
      await expect(
        editRequirement(db as unknown as Db, requirement.id, {
          description: 'Nope',
        }),
      ).rejects.toThrow('archived')
    })
  })

  describe('transitionStatus', () => {
    it('transitions Draft to Review', async () => {
      await seedStatuses(db)
      const area = await seedArea(db)
      const { requirement } = await createRequirement(db as unknown as Db, {
        requirementAreaId: area.id,
        description: 'T',
      })
      const result = await transitionStatus(
        db as unknown as Db,
        requirement.id,
        2,
      )
      expect(result.statusId).toBe(2)
    })

    it('rejects invalid transition', async () => {
      await seedStatuses(db)
      const area = await seedArea(db)
      const { requirement } = await createRequirement(db as unknown as Db, {
        requirementAreaId: area.id,
        description: 'T',
      })
      await expect(
        transitionStatus(db as unknown as Db, requirement.id, 3),
      ).rejects.toThrow('Invalid transition')
    })

    it('rejects invalid status ID', async () => {
      await seedStatuses(db)
      const area = await seedArea(db)
      const { requirement } = await createRequirement(db as unknown as Db, {
        requirementAreaId: area.id,
        description: 'T',
      })
      await expect(
        transitionStatus(db as unknown as Db, requirement.id, 99),
      ).rejects.toThrow('Invalid status')
    })
  })

  describe('initiateArchiving', () => {
    it('moves published requirement to review with archiveInitiatedAt set', async () => {
      await seedStatuses(db)
      const area = await seedArea(db)
      const { requirement } = await createRequirement(db as unknown as Db, {
        requirementAreaId: area.id,
        description: 'T',
      })
      await transitionStatus(db as unknown as Db, requirement.id, 2)
      await transitionStatus(db as unknown as Db, requirement.id, 3)
      const before = await getRequirementById(
        db as unknown as Db,
        requirement.id,
      )
      const editedAtBefore = before?.versions[0]?.editedAt
      await initiateArchiving(db as unknown as Db, requirement.id)
      const full = await getRequirementById(db as unknown as Db, requirement.id)
      expect(full?.isArchived).toBe(false)
      const latest = full?.versions[0]
      expect(latest?.status).toBe(2) // Review
      expect(latest?.archiveInitiatedAt).not.toBeNull()
      expect(latest?.editedAt).toBe(editedAtBefore)
    })

    it('rejects initiating archiving from non-published status', async () => {
      await seedStatuses(db)
      const area = await seedArea(db)
      const { requirement } = await createRequirement(db as unknown as Db, {
        requirementAreaId: area.id,
        description: 'T',
      })
      await expect(
        initiateArchiving(db as unknown as Db, requirement.id),
      ).rejects.toThrow('No published version found to archive')
    })

    it('rejects initiating archiving when there is a pending draft version', async () => {
      await seedStatuses(db)
      const area = await seedArea(db)
      const { requirement } = await createRequirement(db as unknown as Db, {
        requirementAreaId: area.id,
        description: 'V1',
      })
      // Publish v1
      await transitionStatus(db as unknown as Db, requirement.id, 2)
      await transitionStatus(db as unknown as Db, requirement.id, 3)
      // Create a new draft v2 on top
      await editRequirement(db as unknown as Db, requirement.id, {
        description: 'V2',
      })
      // Archiving should be rejected due to pending work
      await expect(
        initiateArchiving(db as unknown as Db, requirement.id),
      ).rejects.toThrow('pending draft or review')
    })
  })

  describe('approveArchiving', () => {
    it('archives a requirement after archiving review', async () => {
      await seedStatuses(db)
      const area = await seedArea(db)
      const { requirement } = await createRequirement(db as unknown as Db, {
        requirementAreaId: area.id,
        description: 'T',
      })
      await transitionStatus(db as unknown as Db, requirement.id, 2)
      await transitionStatus(db as unknown as Db, requirement.id, 3)
      const before = await getRequirementById(
        db as unknown as Db,
        requirement.id,
      )
      const editedAtBefore = before?.versions[0]?.editedAt
      await initiateArchiving(db as unknown as Db, requirement.id)
      await approveArchiving(db as unknown as Db, requirement.id)
      const full = await getRequirementById(db as unknown as Db, requirement.id)
      expect(full?.isArchived).toBe(true)
      const latest = full?.versions[0]
      expect(latest?.status).toBe(4) // Archived
      expect(latest?.archivedAt).not.toBeNull()
      expect(latest?.editedAt).toBe(editedAtBefore)
    })
  })

  describe('cancelArchiving', () => {
    it('returns requirement to published and clears archiveInitiatedAt', async () => {
      await seedStatuses(db)
      const area = await seedArea(db)
      const { requirement } = await createRequirement(db as unknown as Db, {
        requirementAreaId: area.id,
        description: 'T',
      })
      await transitionStatus(db as unknown as Db, requirement.id, 2)
      await transitionStatus(db as unknown as Db, requirement.id, 3)
      const before = await getRequirementById(
        db as unknown as Db,
        requirement.id,
      )
      const editedAtBefore = before?.versions[0]?.editedAt
      await initiateArchiving(db as unknown as Db, requirement.id)
      await cancelArchiving(db as unknown as Db, requirement.id)
      const full = await getRequirementById(db as unknown as Db, requirement.id)
      expect(full?.isArchived).toBe(false)
      const latest = full?.versions[0]
      expect(latest?.status).toBe(3) // Published
      expect(latest?.archiveInitiatedAt).toBeNull()
      expect(latest?.editedAt).toBe(editedAtBefore)
    })
  })

  describe('deleteDraftVersion', () => {
    it('deletes lone draft and requirement', async () => {
      await seedStatuses(db)
      const area = await seedArea(db)
      const { requirement } = await createRequirement(db as unknown as Db, {
        requirementAreaId: area.id,
        description: 'Temp',
      })
      const result = await deleteDraftVersion(
        db as unknown as Db,
        requirement.id,
      )
      expect(result.deleted).toBe('requirement')
    })

    it('deletes draft but keeps published', async () => {
      await seedStatuses(db)
      const area = await seedArea(db)
      const { requirement } = await createRequirement(db as unknown as Db, {
        requirementAreaId: area.id,
        description: 'V1',
      })
      await transitionStatus(db as unknown as Db, requirement.id, 2)
      await transitionStatus(db as unknown as Db, requirement.id, 3)
      await editRequirement(db as unknown as Db, requirement.id, {
        description: 'V2',
      })
      const result = await deleteDraftVersion(
        db as unknown as Db,
        requirement.id,
      )
      expect(result.deleted).toBe('version')
    })

    it('throws when no draft', async () => {
      await seedStatuses(db)
      const area = await seedArea(db)
      const { requirement } = await createRequirement(db as unknown as Db, {
        requirementAreaId: area.id,
        description: 'V1',
      })
      await transitionStatus(db as unknown as Db, requirement.id, 2)
      await expect(
        deleteDraftVersion(db as unknown as Db, requirement.id),
      ).rejects.toThrow('draft')
    })
  })

  describe('reactivateRequirement', () => {
    it('creates new draft from archived', async () => {
      await seedStatuses(db)
      const area = await seedArea(db)
      const { requirement } = await createRequirement(db as unknown as Db, {
        requirementAreaId: area.id,
        description: 'V1',
      })
      await transitionStatus(db as unknown as Db, requirement.id, 2)
      await transitionStatus(db as unknown as Db, requirement.id, 3)
      await initiateArchiving(db as unknown as Db, requirement.id)
      await approveArchiving(db as unknown as Db, requirement.id)
      const v2 = await reactivateRequirement(
        db as unknown as Db,
        requirement.id,
      )
      expect(v2.statusId).toBe(1)
      expect(v2.versionNumber).toBe(2)
    })

    it('throws when not archived', async () => {
      await seedStatuses(db)
      const area = await seedArea(db)
      const { requirement } = await createRequirement(db as unknown as Db, {
        requirementAreaId: area.id,
        description: 'V1',
      })
      await expect(
        reactivateRequirement(db as unknown as Db, requirement.id),
      ).rejects.toThrow('archived')
    })
  })

  describe('restoreVersion', () => {
    it('creates new draft copying old version data', async () => {
      await seedStatuses(db)
      const area = await seedArea(db)
      const { requirement, version: v1 } = await createRequirement(
        db as unknown as Db,
        {
          requirementAreaId: area.id,
          description: 'Original',
        },
      )
      await transitionStatus(db as unknown as Db, requirement.id, 2)
      await transitionStatus(db as unknown as Db, requirement.id, 3)
      await editRequirement(db as unknown as Db, requirement.id, {
        description: 'V2',
      })

      const restored = await restoreVersion(
        db as unknown as Db,
        requirement.id,
        v1.id,
      )
      expect(restored.description).toBe('Original')
      expect(restored.versionNumber).toBe(3)
    })

    it('throws for invalid version', async () => {
      await seedStatuses(db)
      const area = await seedArea(db)
      const { requirement } = await createRequirement(db as unknown as Db, {
        requirementAreaId: area.id,
        description: 'V1',
      })
      await expect(
        restoreVersion(db as unknown as Db, requirement.id, 999),
      ).rejects.toThrow()
    })
  })

  describe('getVersionHistory', () => {
    it('returns versions newest first', async () => {
      await seedStatuses(db)
      const area = await seedArea(db)
      const { requirement } = await createRequirement(db as unknown as Db, {
        requirementAreaId: area.id,
        description: 'V1',
      })
      await transitionStatus(db as unknown as Db, requirement.id, 2)
      await transitionStatus(db as unknown as Db, requirement.id, 3)
      await editRequirement(db as unknown as Db, requirement.id, {
        description: 'V2',
      })

      const history = await getVersionHistory(
        db as unknown as Db,
        requirement.id,
      )
      expect(history).toHaveLength(2)
      expect(history[0].versionNumber).toBe(2)
      expect(history[1].versionNumber).toBe(1)
    })
  })
})
