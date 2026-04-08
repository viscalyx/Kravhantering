import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import BetterSqlite3 from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { beforeEach, describe, expect, it } from 'vitest'
import * as schema from '@/drizzle/schema'
import {
  countSuggestionsByRequirement,
  countSuggestionsForRequirements,
  createSuggestion,
  deleteSuggestion,
  getSuggestion,
  listSuggestionsForRequirement,
  recordResolution,
  requestReview,
  revertToDraft,
  updateSuggestion,
} from '@/lib/dal/improvement-suggestions'
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
}

describe('improvement suggestions DAL', () => {
  let db: TestDb

  beforeEach(() => {
    ;({ db } = createTestDb())
  })

  describe('createSuggestion', () => {
    it('creates suggestion and returns its id', async () => {
      await seedRequiredData(db)
      const result = await createSuggestion(db as unknown as AppDatabase, {
        requirementId: 1,
        content: 'Needs improvement',
        createdBy: 'tester',
      })
      expect(result.id).toBeGreaterThan(0)
    })

    it('throws validation error for empty content', async () => {
      await seedRequiredData(db)
      await expect(
        createSuggestion(db as unknown as AppDatabase, {
          requirementId: 1,
          content: '  ',
        }),
      ).rejects.toThrow(RequirementsServiceError)
    })

    it('throws not_found for non-existent requirement', async () => {
      await seedRequiredData(db)
      await expect(
        createSuggestion(db as unknown as AppDatabase, {
          requirementId: 999,
          content: 'Valid content',
        }),
      ).rejects.toThrow('Requirement 999 not found')
    })

    it('links suggestion to a specific version', async () => {
      await seedRequiredData(db)
      const result = await createSuggestion(db as unknown as AppDatabase, {
        requirementId: 1,
        content: 'Version-specific suggestion',
        requirementVersionId: 1,
      })
      const fb = await getSuggestion(db as unknown as AppDatabase, result.id)
      expect(fb.requirementVersionId).toBe(1)
    })
  })

  describe('listSuggestionsForRequirement', () => {
    it('returns empty array when no suggestions', async () => {
      await seedRequiredData(db)
      const result = await listSuggestionsForRequirement(
        db as unknown as AppDatabase,
        1,
      )
      expect(result).toEqual([])
    })

    it('returns suggestion items ordered by creation', async () => {
      await seedRequiredData(db)
      await createSuggestion(db as unknown as AppDatabase, {
        requirementId: 1,
        content: 'First suggestion',
      })
      await createSuggestion(db as unknown as AppDatabase, {
        requirementId: 1,
        content: 'Second suggestion',
      })
      const result = await listSuggestionsForRequirement(
        db as unknown as AppDatabase,
        1,
      )
      expect(result).toHaveLength(2)
      expect(result[0].content).toBe('First suggestion')
      expect(result[1].content).toBe('Second suggestion')
    })
  })

  describe('getSuggestion', () => {
    it('returns suggestion by id', async () => {
      await seedRequiredData(db)
      const { id } = await createSuggestion(db as unknown as AppDatabase, {
        requirementId: 1,
        content: 'Single suggestion',
      })
      const fb = await getSuggestion(db as unknown as AppDatabase, id)
      expect(fb.content).toBe('Single suggestion')
      expect(fb.id).toBe(id)
    })

    it('throws not_found for missing suggestion', async () => {
      await seedRequiredData(db)
      await expect(
        getSuggestion(db as unknown as AppDatabase, 999),
      ).rejects.toThrow('Improvement suggestion 999 not found')
    })
  })

  describe('updateSuggestion', () => {
    it('updates content before resolution', async () => {
      await seedRequiredData(db)
      const { id } = await createSuggestion(db as unknown as AppDatabase, {
        requirementId: 1,
        content: 'Original',
      })
      await updateSuggestion(db as unknown as AppDatabase, id, {
        content: 'Updated content',
      })
      const fb = await getSuggestion(db as unknown as AppDatabase, id)
      expect(fb.content).toBe('Updated content')
    })

    it('throws conflict when suggestion has resolution', async () => {
      await seedRequiredData(db)
      const { id } = await createSuggestion(db as unknown as AppDatabase, {
        requirementId: 1,
        content: 'Resolved suggestion',
      })
      await requestReview(db as unknown as AppDatabase, id)
      await recordResolution(db as unknown as AppDatabase, id, {
        resolution: 1,
        resolutionMotivation: 'Fixed the issue',
        resolvedBy: 'resolver',
      })
      await expect(
        updateSuggestion(db as unknown as AppDatabase, id, {
          content: 'Too late',
        }),
      ).rejects.toThrow(
        'Cannot edit an improvement suggestion after a resolution has been recorded',
      )
    })

    it('throws conflict when suggestion is submitted for review', async () => {
      await seedRequiredData(db)
      const { id } = await createSuggestion(db as unknown as AppDatabase, {
        requirementId: 1,
        content: 'Under review',
      })
      await requestReview(db as unknown as AppDatabase, id)
      await expect(
        updateSuggestion(db as unknown as AppDatabase, id, {
          content: 'Too late',
        }),
      ).rejects.toThrow(
        'Cannot edit an improvement suggestion that has been submitted for review',
      )
    })
  })

  describe('recordResolution', () => {
    it('records a resolved resolution', async () => {
      await seedRequiredData(db)
      const { id } = await createSuggestion(db as unknown as AppDatabase, {
        requirementId: 1,
        content: 'Needs action',
      })
      await requestReview(db as unknown as AppDatabase, id)
      await recordResolution(db as unknown as AppDatabase, id, {
        resolution: 1,
        resolutionMotivation: 'Applied fix',
        resolvedBy: 'resolver',
      })
      const fb = await getSuggestion(db as unknown as AppDatabase, id)
      expect(fb.resolution).toBe(1)
      expect(fb.resolutionMotivation).toBe('Applied fix')
      expect(fb.resolvedBy).toBe('resolver')
      expect(fb.resolvedAt).toBeTruthy()
    })

    it('records a dismissed resolution', async () => {
      await seedRequiredData(db)
      const { id } = await createSuggestion(db as unknown as AppDatabase, {
        requirementId: 1,
        content: 'Not relevant',
      })
      await requestReview(db as unknown as AppDatabase, id)
      await recordResolution(db as unknown as AppDatabase, id, {
        resolution: 2,
        resolutionMotivation: 'Out of scope',
        resolvedBy: 'reviewer',
      })
      const fb = await getSuggestion(db as unknown as AppDatabase, id)
      expect(fb.resolution).toBe(2)
    })

    it('throws conflict when already resolved', async () => {
      await seedRequiredData(db)
      const { id } = await createSuggestion(db as unknown as AppDatabase, {
        requirementId: 1,
        content: 'Already handled',
      })
      await requestReview(db as unknown as AppDatabase, id)
      await recordResolution(db as unknown as AppDatabase, id, {
        resolution: 1,
        resolutionMotivation: 'Done',
        resolvedBy: 'resolver',
      })
      await expect(
        recordResolution(db as unknown as AppDatabase, id, {
          resolution: 2,
          resolutionMotivation: 'Nope',
          resolvedBy: 'reviewer',
        }),
      ).rejects.toThrow('resolution has already been recorded')
    })

    it('throws validation for invalid resolution value', async () => {
      await seedRequiredData(db)
      const { id } = await createSuggestion(db as unknown as AppDatabase, {
        requirementId: 1,
        content: 'Invalid',
      })
      await requestReview(db as unknown as AppDatabase, id)
      await expect(
        recordResolution(db as unknown as AppDatabase, id, {
          resolution: 99,
          resolutionMotivation: 'Bad',
          resolvedBy: 'reviewer',
        }),
      ).rejects.toThrow('Resolution must be 1 (resolved) or 2 (dismissed)')
    })

    it('throws conflict when suggestion is still a draft', async () => {
      await seedRequiredData(db)
      const { id } = await createSuggestion(db as unknown as AppDatabase, {
        requirementId: 1,
        content: 'Still a draft',
      })
      await expect(
        recordResolution(db as unknown as AppDatabase, id, {
          resolution: 1,
          resolutionMotivation: 'Premature',
          resolvedBy: 'reviewer',
        }),
      ).rejects.toThrow(
        'Can only resolve or dismiss suggestions that have been submitted for review',
      )
    })
  })

  describe('deleteSuggestion', () => {
    it('deletes suggestion without resolution', async () => {
      await seedRequiredData(db)
      const { id } = await createSuggestion(db as unknown as AppDatabase, {
        requirementId: 1,
        content: 'To delete',
      })
      await deleteSuggestion(db as unknown as AppDatabase, id)
      await expect(
        getSuggestion(db as unknown as AppDatabase, id),
      ).rejects.toThrow('not found')
    })

    it('throws conflict when suggestion has resolution', async () => {
      await seedRequiredData(db)
      const { id } = await createSuggestion(db as unknown as AppDatabase, {
        requirementId: 1,
        content: 'Resolved',
      })
      await requestReview(db as unknown as AppDatabase, id)
      await recordResolution(db as unknown as AppDatabase, id, {
        resolution: 1,
        resolutionMotivation: 'Done',
        resolvedBy: 'resolver',
      })
      await expect(
        deleteSuggestion(db as unknown as AppDatabase, id),
      ).rejects.toThrow(
        'Cannot delete an improvement suggestion after a resolution has been recorded',
      )
    })

    it('throws conflict when suggestion is submitted for review', async () => {
      await seedRequiredData(db)
      const { id } = await createSuggestion(db as unknown as AppDatabase, {
        requirementId: 1,
        content: 'Under review',
      })
      await requestReview(db as unknown as AppDatabase, id)
      await expect(
        deleteSuggestion(db as unknown as AppDatabase, id),
      ).rejects.toThrow(
        'Cannot delete an improvement suggestion that has been submitted for review',
      )
    })
  })

  describe('requestReview', () => {
    it('sets review requested flag', async () => {
      await seedRequiredData(db)
      const { id } = await createSuggestion(db as unknown as AppDatabase, {
        requirementId: 1,
        content: 'Review me',
      })
      await requestReview(db as unknown as AppDatabase, id)
      const fb = await getSuggestion(db as unknown as AppDatabase, id)
      expect(fb.isReviewRequested).toBe(1)
    })

    it('throws conflict when already in review', async () => {
      await seedRequiredData(db)
      const { id } = await createSuggestion(db as unknown as AppDatabase, {
        requirementId: 1,
        content: 'Review me',
      })
      await requestReview(db as unknown as AppDatabase, id)
      await expect(
        requestReview(db as unknown as AppDatabase, id),
      ).rejects.toThrow('Review has already been requested')
    })

    it('throws conflict when already resolved', async () => {
      await seedRequiredData(db)
      const { id } = await createSuggestion(db as unknown as AppDatabase, {
        requirementId: 1,
        content: 'Already done',
      })
      await requestReview(db as unknown as AppDatabase, id)
      await recordResolution(db as unknown as AppDatabase, id, {
        resolution: 1,
        resolutionMotivation: 'Done',
        resolvedBy: 'resolver',
      })
      await expect(
        requestReview(db as unknown as AppDatabase, id),
      ).rejects.toThrow('already has a resolution')
    })
  })

  describe('revertToDraft', () => {
    it('reverts from review to draft', async () => {
      await seedRequiredData(db)
      const { id } = await createSuggestion(db as unknown as AppDatabase, {
        requirementId: 1,
        content: 'Revert me',
      })
      await requestReview(db as unknown as AppDatabase, id)
      await revertToDraft(db as unknown as AppDatabase, id)
      const fb = await getSuggestion(db as unknown as AppDatabase, id)
      expect(fb.isReviewRequested).toBe(0)
    })

    it('throws conflict when already in draft', async () => {
      await seedRequiredData(db)
      const { id } = await createSuggestion(db as unknown as AppDatabase, {
        requirementId: 1,
        content: 'Already draft',
      })
      await expect(
        revertToDraft(db as unknown as AppDatabase, id),
      ).rejects.toThrow('already in draft')
    })

    it('throws conflict when already resolved', async () => {
      await seedRequiredData(db)
      const { id } = await createSuggestion(db as unknown as AppDatabase, {
        requirementId: 1,
        content: 'Resolved',
      })
      await requestReview(db as unknown as AppDatabase, id)
      await recordResolution(db as unknown as AppDatabase, id, {
        resolution: 2,
        resolutionMotivation: 'Nah',
        resolvedBy: 'reviewer',
      })
      await expect(
        revertToDraft(db as unknown as AppDatabase, id),
      ).rejects.toThrow('already has a resolution')
    })
  })

  describe('countSuggestionsByRequirement', () => {
    it('returns zeros for requirement with no suggestions', async () => {
      await seedRequiredData(db)
      const counts = await countSuggestionsByRequirement(
        db as unknown as AppDatabase,
        1,
      )
      expect(counts).toEqual({
        total: 0,
        pending: 0,
        resolved: 0,
        dismissed: 0,
      })
    })

    it('counts suggestions by resolution status', async () => {
      await seedRequiredData(db)
      await createSuggestion(db as unknown as AppDatabase, {
        requirementId: 1,
        content: 'Pending',
      })
      const { id: resolvedId } = await createSuggestion(
        db as unknown as AppDatabase,
        {
          requirementId: 1,
          content: 'To resolve',
        },
      )
      await requestReview(db as unknown as AppDatabase, resolvedId)
      await recordResolution(db as unknown as AppDatabase, resolvedId, {
        resolution: 1,
        resolutionMotivation: 'Fixed',
        resolvedBy: 'r',
      })
      const { id: dismissedId } = await createSuggestion(
        db as unknown as AppDatabase,
        {
          requirementId: 1,
          content: 'To dismiss',
        },
      )
      await requestReview(db as unknown as AppDatabase, dismissedId)
      await recordResolution(db as unknown as AppDatabase, dismissedId, {
        resolution: 2,
        resolutionMotivation: 'Not relevant',
        resolvedBy: 'r',
      })

      const counts = await countSuggestionsByRequirement(
        db as unknown as AppDatabase,
        1,
      )
      expect(counts.total).toBe(3)
      expect(counts.pending).toBe(1)
      expect(counts.resolved).toBe(1)
      expect(counts.dismissed).toBe(1)
    })
  })

  describe('countSuggestionsForRequirements', () => {
    it('returns counts per requirement including zero counts', async () => {
      await seedRequiredData(db)
      // Add requirements 2 and 3
      await db.insert(schema.requirements).values([
        {
          id: 2,
          requirementAreaId: 1,
          sequenceNumber: 2,
          uniqueId: 'TST-002',
        },
        {
          id: 3,
          requirementAreaId: 1,
          sequenceNumber: 3,
          uniqueId: 'TST-003',
        },
      ])
      await db.insert(schema.requirementVersions).values([
        {
          description: 'Req 2',
          id: 2,
          requirementId: 2,
          requiresTesting: false,
          statusId: 3,
          versionNumber: 1,
        },
        {
          description: 'Req 3',
          id: 3,
          requirementId: 3,
          requiresTesting: false,
          statusId: 3,
          versionNumber: 1,
        },
      ])

      // Req 1: 2 suggestions (1 pending, 1 resolved)
      await createSuggestion(db as unknown as AppDatabase, {
        requirementId: 1,
        content: 'Pending on req 1',
      })
      const { id: resolvedId } = await createSuggestion(
        db as unknown as AppDatabase,
        { requirementId: 1, content: 'Resolved on req 1' },
      )
      await requestReview(db as unknown as AppDatabase, resolvedId)
      await recordResolution(db as unknown as AppDatabase, resolvedId, {
        resolution: 1,
        resolutionMotivation: 'Done',
        resolvedBy: 'r',
      })

      // Req 2: 1 suggestion (pending)
      await createSuggestion(db as unknown as AppDatabase, {
        requirementId: 2,
        content: 'Pending on req 2',
      })

      // Req 3: no suggestions

      const map = await countSuggestionsForRequirements(
        db as unknown as AppDatabase,
        [1, 2, 3],
      )

      const req1 = map.get(1)
      expect(req1).toBeDefined()
      expect(req1?.total).toBe(2)
      expect(req1?.pending).toBe(1)

      const req2 = map.get(2)
      expect(req2).toBeDefined()
      expect(req2?.total).toBe(1)
      expect(req2?.pending).toBe(1)

      // Req 3 has no suggestions, so it won't be in the map
      expect(map.has(3)).toBe(false)
    })
  })
})
