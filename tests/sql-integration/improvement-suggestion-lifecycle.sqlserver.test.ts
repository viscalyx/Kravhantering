import { describe, expect, it } from 'vitest'
import {
  createSuggestion,
  SUGGESTION_DISMISSED,
  SUGGESTION_RESOLVED,
} from '@/lib/dal/improvement-suggestions'
import type { SqlServerDatabase } from '@/lib/db'
import { isRequirementsServiceError } from '@/lib/requirements/errors'
import {
  deleteImprovementSuggestionWithAudit,
  requestImprovementSuggestionReview,
  resolveImprovementSuggestionWithAudit,
  revertImprovementSuggestionToDraft,
  updateImprovementSuggestion,
} from '@/lib/requirements/improvement-suggestion-mutations'
import ImprovementSuggestionLifecycle from '@/typeorm/migrations/0052_improvement_suggestion_lifecycle.mjs'
import {
  createArea,
  createPublishedRequirement,
  makeRequestContext,
  useSqlIntegrationDatabase,
} from './helpers/sql-test-database'

const actor = {
  displayName: 'SQL Integration Actor',
  hsaId: 'SE5560000001-sqltest1',
}

async function createFixture(db: SqlServerDatabase) {
  const area = await createArea(db)
  const requirement = await createPublishedRequirement(
    db,
    area.id,
    'Improvement suggestion SQL integration fixture',
  )
  return { area, requirement }
}

function createDraft(
  db: SqlServerDatabase,
  fixture: Awaited<ReturnType<typeof createFixture>>,
  content: string,
) {
  return createSuggestion(db, {
    content,
    createdBy: actor.displayName,
    createdByHsaId: actor.hsaId,
    requirementId: fixture.requirement.requirementId,
    requirementVersionId: fixture.requirement.publishedVersionId,
  })
}

function rejectedReason(result: PromiseSettledResult<unknown>): string | null {
  if (result.status !== 'rejected') return null
  return isRequirementsServiceError(result.reason)
    ? String(result.reason.details?.reason ?? result.reason.code)
    : null
}

async function lifecycleRow(db: SqlServerDatabase, suggestionId: number) {
  const rows = (await db.query(
    `SELECT
       CAST(is_review_requested AS int) AS isReviewRequested,
       resolution,
       review_requested_at AS reviewRequestedAt,
       resolved_at AS resolvedAt
     FROM improvement_suggestions
     WHERE id = @0`,
    [suggestionId],
  )) as Array<{
    isReviewRequested: number
    resolution: number | null
    resolvedAt: Date | null
    reviewRequestedAt: Date | null
  }>
  return rows[0] ?? null
}

async function countActionRows(
  db: SqlServerDatabase,
  suggestionId: number,
): Promise<number> {
  const rows = (await db.query(
    `SELECT COUNT(*) AS count
     FROM action_audit_events
     WHERE target_kind = N'ImprovementSuggestion'
       AND target_id = @0`,
    [String(suggestionId)],
  )) as Array<{ count: number }>
  return Number(rows[0]?.count ?? 0)
}

async function hasLifecycleConstraint(db: SqlServerDatabase): Promise<boolean> {
  const rows = (await db.query(
    `SELECT COUNT(*) AS constraintCount
     FROM sys.check_constraints
     WHERE [name] = N'chk_improvement_suggestions_lifecycle'
       AND [parent_object_id] = OBJECT_ID(N'dbo.improvement_suggestions')`,
  )) as Array<{ constraintCount: number }>
  return Number(rows[0]?.constraintCount ?? 0) > 0
}

describe('Improvement suggestion lifecycle and audited mutations', () => {
  const appDb = useSqlIntegrationDatabase()

  it('normalizes legacy evidence without inventing missing lifecycle data', async () => {
    const migration = new ImprovementSuggestionLifecycle()
    try {
      const fixture = await createFixture(appDb())
      await migration.down(appDb())

      await appDb().query(
        `INSERT INTO improvement_suggestions (
           requirement_id,
           requirement_version_id,
           content,
           is_review_requested,
           review_requested_at,
           resolution,
           resolution_motivation,
           resolved_at,
           created_at
         )
         VALUES
           (@0, @1, N'Complete handled evidence', 1, '2026-01-02', 1,
            N'Complete motivation', '2026-01-03', '2026-01-01'),
           (@0, @1, N'Incomplete handled evidence', 1, '2026-01-02', 2,
            NULL, NULL, '2026-01-01'),
           (@0, @1, N'Invalid review evidence', 1, NULL, 1,
            N'Orphan motivation', '2026-01-03', '2026-01-01')`,
        [
          fixture.requirement.requirementId,
          fixture.requirement.publishedVersionId,
        ],
      )

      await migration.up(appDb())

      const rows = (await appDb().query(
        `SELECT
           content,
           CAST(is_review_requested AS int) AS isReviewRequested,
           resolution,
           resolution_motivation AS resolutionMotivation,
           review_requested_at AS reviewRequestedAt,
           resolved_at AS resolvedAt
         FROM improvement_suggestions
         ORDER BY id`,
      )) as Array<{
        content: string
        isReviewRequested: number
        resolution: number | null
        resolutionMotivation: string | null
        reviewRequestedAt: Date | null
        resolvedAt: Date | null
      }>

      expect(rows).toEqual([
        expect.objectContaining({
          content: 'Complete handled evidence',
          isReviewRequested: 1,
          resolution: 1,
          resolutionMotivation: 'Complete motivation',
        }),
        {
          content: 'Incomplete handled evidence',
          isReviewRequested: 1,
          resolution: null,
          resolutionMotivation: null,
          resolvedAt: null,
          reviewRequestedAt: new Date('2026-01-02T00:00:00.000Z'),
        },
        {
          content: 'Invalid review evidence',
          isReviewRequested: 0,
          resolution: null,
          resolutionMotivation: null,
          resolvedAt: null,
          reviewRequestedAt: null,
        },
      ])
    } finally {
      if (!(await hasLifecycleConstraint(appDb()))) {
        await migration.up(appDb())
      }
    }
  })

  it('rejects incoherent rows with the lifecycle constraint', async () => {
    const fixture = await createFixture(appDb())

    await expect(
      appDb().query(
        `INSERT INTO improvement_suggestions (
           requirement_id,
           requirement_version_id,
           content,
           is_review_requested,
           created_at
         )
         VALUES (@0, @1, N'Incoherent review', 1, SYSUTCDATETIME())`,
        [
          fixture.requirement.requirementId,
          fixture.requirement.publishedVersionId,
        ],
      ),
    ).rejects.toThrow('chk_improvement_suggestions_lifecycle')

    const draft = await createDraft(
      appDb(),
      fixture,
      'Constraint update fixture',
    )
    await expect(
      appDb().query(
        `UPDATE improvement_suggestions
         SET resolution = 1,
             resolution_motivation = N'Missing review evidence',
             resolved_at = SYSUTCDATETIME()
         WHERE id = @0`,
        [draft.id],
      ),
    ).rejects.toThrow('chk_improvement_suggestions_lifecycle')
  })

  it('returns reason-coded conflicts for repeated and simultaneous review requests', async () => {
    const fixture = await createFixture(appDb())
    const repeated = await createDraft(appDb(), fixture, 'Repeated review')
    await requestImprovementSuggestionReview(appDb(), repeated.id)
    const firstTimestamp = (await lifecycleRow(appDb(), repeated.id))
      ?.reviewRequestedAt

    await expect(
      requestImprovementSuggestionReview(appDb(), repeated.id),
    ).rejects.toMatchObject({
      details: {
        reason: 'improvement_suggestion_review_already_requested',
      },
      status: 409,
    })
    expect(
      (
        await lifecycleRow(appDb(), repeated.id)
      )?.reviewRequestedAt?.toISOString(),
    ).toBe(firstTimestamp?.toISOString())

    const simultaneous = await createDraft(
      appDb(),
      fixture,
      'Simultaneous review',
    )
    const results = await Promise.allSettled([
      requestImprovementSuggestionReview(appDb(), simultaneous.id),
      requestImprovementSuggestionReview(appDb(), simultaneous.id),
    ])

    expect(
      results.filter(result => result.status === 'fulfilled'),
    ).toHaveLength(1)
    expect(results.map(rejectedReason)).toContain(
      'improvement_suggestion_review_already_requested',
    )
  })

  it('commits exactly one of competing resolve and dismiss writes', async () => {
    const fixture = await createFixture(appDb())
    const suggestion = await createDraft(
      appDb(),
      fixture,
      'Resolve versus dismiss',
    )
    await requestImprovementSuggestionReview(appDb(), suggestion.id)

    const results = await Promise.allSettled([
      resolveImprovementSuggestionWithAudit(
        appDb(),
        suggestion.id,
        {
          resolution: SUGGESTION_RESOLVED,
          resolutionMotivation: 'Handled.',
          resolvedBy: actor.displayName,
          resolvedByHsaId: actor.hsaId,
        },
        await makeRequestContext(),
      ),
      resolveImprovementSuggestionWithAudit(
        appDb(),
        suggestion.id,
        {
          resolution: SUGGESTION_DISMISSED,
          resolutionMotivation: 'Dismissed.',
          resolvedBy: actor.displayName,
          resolvedByHsaId: actor.hsaId,
        },
        await makeRequestContext(),
      ),
    ])

    expect(
      results.filter(result => result.status === 'fulfilled'),
    ).toHaveLength(1)
    expect(results.map(rejectedReason)).toContain(
      'improvement_suggestion_already_resolved',
    )
    expect(await countActionRows(appDb(), suggestion.id)).toBe(1)
  })

  it('serializes delete against review with one deterministic loser', async () => {
    const fixture = await createFixture(appDb())
    const suggestion = await createDraft(
      appDb(),
      fixture,
      'Delete versus review',
    )
    const results = await Promise.allSettled([
      deleteImprovementSuggestionWithAudit(
        appDb(),
        suggestion.id,
        await makeRequestContext(),
      ),
      requestImprovementSuggestionReview(appDb(), suggestion.id),
    ])

    expect(
      results.filter(result => result.status === 'fulfilled'),
    ).toHaveLength(1)
    const rejected = results.find(result => result.status === 'rejected')
    expect(rejected).toBeDefined()
    if (rejected?.status === 'rejected') {
      expect(isRequirementsServiceError(rejected.reason)).toBe(true)
      if (isRequirementsServiceError(rejected.reason)) {
        expect([404, 409]).toContain(rejected.reason.status)
        if (rejected.reason.status === 409) {
          expect(rejected.reason.details?.reason).toBe(
            'improvement_suggestion_not_draft',
          )
        }
      }
    }
  })

  it('keeps a coherent result when revert races resolution', async () => {
    const fixture = await createFixture(appDb())
    const suggestion = await createDraft(
      appDb(),
      fixture,
      'Revert versus resolution',
    )
    await requestImprovementSuggestionReview(appDb(), suggestion.id)

    const results = await Promise.allSettled([
      revertImprovementSuggestionToDraft(appDb(), suggestion.id),
      resolveImprovementSuggestionWithAudit(
        appDb(),
        suggestion.id,
        {
          resolution: SUGGESTION_RESOLVED,
          resolutionMotivation: 'Handled during race.',
          resolvedBy: actor.displayName,
          resolvedByHsaId: actor.hsaId,
        },
        await makeRequestContext(),
      ),
    ])

    expect(
      results.filter(result => result.status === 'fulfilled'),
    ).toHaveLength(1)
    expect(results.map(rejectedReason)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(
          /improvement_suggestion_(already_resolved|review_required)/,
        ),
      ]),
    )
    const row = await lifecycleRow(appDb(), suggestion.id)
    expect(
      row?.isReviewRequested === 0 ||
        (row?.isReviewRequested === 1 && row.resolution === 1),
    ).toBe(true)
  })

  it('rejects stale edit, revert, and delete writes by lifecycle state', async () => {
    const fixture = await createFixture(appDb())
    const reviewed = await createDraft(appDb(), fixture, 'Stale draft writes')
    await requestImprovementSuggestionReview(appDb(), reviewed.id)

    await expect(
      updateImprovementSuggestion(appDb(), reviewed.id, {
        content: 'Stale content',
      }),
    ).rejects.toMatchObject({
      details: { reason: 'improvement_suggestion_not_draft' },
    })
    await expect(
      deleteImprovementSuggestionWithAudit(
        appDb(),
        reviewed.id,
        await makeRequestContext(),
      ),
    ).rejects.toMatchObject({
      details: { reason: 'improvement_suggestion_not_draft' },
    })

    await resolveImprovementSuggestionWithAudit(
      appDb(),
      reviewed.id,
      {
        resolution: SUGGESTION_RESOLVED,
        resolutionMotivation: 'Handled before stale revert.',
        resolvedBy: actor.displayName,
        resolvedByHsaId: actor.hsaId,
      },
      await makeRequestContext(),
    )
    await expect(
      revertImprovementSuggestionToDraft(appDb(), reviewed.id),
    ).rejects.toMatchObject({
      details: { reason: 'improvement_suggestion_already_resolved' },
    })
  })

  it('rolls back resolution and deletion when Action log insertion fails', async () => {
    const fixture = await createFixture(appDb())
    const resolutionDraft = await createDraft(
      appDb(),
      fixture,
      'Resolution rollback',
    )
    await requestImprovementSuggestionReview(appDb(), resolutionDraft.id)
    const deleteDraft = await createDraft(appDb(), fixture, 'Delete rollback')

    await appDb().query(
      `CREATE TRIGGER fail_improvement_suggestion_audit
       ON action_audit_events
       AFTER INSERT
       AS
       BEGIN
         SET NOCOUNT ON;
         IF EXISTS (
           SELECT 1
           FROM inserted
           WHERE target_kind = N'ImprovementSuggestion'
         )
           THROW 51020, 'Injected Improvement suggestion Action log failure', 1;
       END`,
    )

    try {
      await expect(
        resolveImprovementSuggestionWithAudit(
          appDb(),
          resolutionDraft.id,
          {
            resolution: SUGGESTION_RESOLVED,
            resolutionMotivation: 'Must roll back.',
            resolvedBy: actor.displayName,
            resolvedByHsaId: actor.hsaId,
          },
          await makeRequestContext(),
        ),
      ).rejects.toThrow('Injected Improvement suggestion Action log failure')
      await expect(
        deleteImprovementSuggestionWithAudit(
          appDb(),
          deleteDraft.id,
          await makeRequestContext(),
        ),
      ).rejects.toThrow('Injected Improvement suggestion Action log failure')
    } finally {
      await appDb().query(
        'DROP TRIGGER IF EXISTS fail_improvement_suggestion_audit',
      )
    }

    expect(await lifecycleRow(appDb(), resolutionDraft.id)).toMatchObject({
      isReviewRequested: 1,
      resolution: null,
      resolvedAt: null,
    })
    expect(await lifecycleRow(appDb(), deleteDraft.id)).toMatchObject({
      isReviewRequested: 0,
      resolution: null,
    })
    expect(await countActionRows(appDb(), resolutionDraft.id)).toBe(0)
    expect(await countActionRows(appDb(), deleteDraft.id)).toBe(0)
  })
})
