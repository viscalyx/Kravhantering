import { describe, expect, it } from 'vitest'
import {
  createRfiQuestionSuggestion,
  requestRfiQuestionSuggestionReview,
} from '@/lib/dal/rfi-questions'
import type { SqlServerDatabase } from '@/lib/db'
import { isRequirementsServiceError } from '@/lib/requirements/errors'
import {
  createRfiQuestionSuggestionWithAudit,
  deleteRfiQuestionSuggestionWithAudit,
  requestRfiQuestionSuggestionReviewWithAudit,
  resolveRfiQuestionSuggestionWithAudit,
} from '@/lib/requirements/rfi-question-suggestion-mutations'
import {
  createArea,
  createSpecificationFixture,
  makeRequestContext,
  useSqlIntegrationDatabase,
} from './helpers/sql-test-database'

const actor = {
  displayName: 'SQL Integration Actor',
  hsaId: 'SE5560000001-sqltest1',
}

async function createQuestion(
  db: SqlServerDatabase,
  areaId: number,
  code = 'SQL-RFI001',
): Promise<number> {
  const rows = (await db.query(
    `INSERT INTO rfi_questions (
       question_code,
       area_id,
       sort_order,
       is_archived,
       created_at,
       updated_at
     )
     OUTPUT INSERTED.id AS id
     VALUES (@0, @1, 1, 0, SYSUTCDATETIME(), SYSUTCDATETIME())`,
    [code, areaId],
  )) as Array<{ id: number }>
  return Number(rows[0]?.id)
}

async function createFixture(db: SqlServerDatabase) {
  const area = await createArea(db)
  const specification = await createSpecificationFixture(db, 'SQL-RFI-515')
  const questionId = await createQuestion(db, area.id)
  return { area, questionId, specification }
}

async function createAuditedDraft(
  db: SqlServerDatabase,
  fixture: Awaited<ReturnType<typeof createFixture>>,
  content: string,
) {
  return createRfiQuestionSuggestionWithAudit(
    db,
    {
      areaId: fixture.area.id,
      content,
      rfiQuestionId: fixture.questionId,
      specificationId: fixture.specification.id,
    },
    actor,
    await makeRequestContext(),
  )
}

function rejectedReason(result: PromiseSettledResult<unknown>): string | null {
  if (result.status !== 'rejected') return null
  return isRequirementsServiceError(result.reason)
    ? String(result.reason.details?.reason ?? result.reason.code)
    : null
}

async function countAuditRows(
  db: SqlServerDatabase,
  action?: string,
): Promise<number> {
  const rows = (await db.query(
    `SELECT COUNT(*) AS count
     FROM action_audit_events
     WHERE target_kind = N'rfi_question_suggestion'
       AND (@0 IS NULL OR action = @0)`,
    [action ?? null],
  )) as Array<{ count: number }>
  return Number(rows[0]?.count ?? 0)
}

describe('RFI question suggestion lifecycle and audited mutations', () => {
  const appDb = useSqlIntegrationDatabase()

  it('rejects invalid direct inserts, evidence changes, and non-draft deletion', async () => {
    const fixture = await createFixture(appDb())

    await expect(
      appDb().query(
        `INSERT INTO rfi_question_suggestions (
           area_id,
           rfi_question_id,
           specification_id,
           source_specification_code,
           source_specification_name,
           content,
           is_review_requested,
           review_requested_at,
           resolution,
           resolution_motivation,
           created_at,
           resolved_at
         )
         VALUES (
           @0, @1, @2, N'SQL-RFI-515', N'SQL specification',
           N'Direct handled insert', 1, SYSUTCDATETIME(), 1,
           N'Direct resolution', SYSUTCDATETIME(), SYSUTCDATETIME()
         )`,
        [fixture.area.id, fixture.questionId, fixture.specification.id],
      ),
    ).rejects.toThrow('must be created as drafts')

    await expect(
      appDb().query(
        `INSERT INTO rfi_question_suggestions (
           area_id,
           content,
           is_review_requested,
           created_at
         )
         VALUES (@0, N'Incoherent review', 1, SYSUTCDATETIME())`,
        [fixture.area.id],
      ),
    ).rejects.toThrow('chk_rfi_question_suggestions_lifecycle')

    const suggestion = await createAuditedDraft(
      appDb(),
      fixture,
      'Immutable evidence',
    )
    await requestRfiQuestionSuggestionReviewWithAudit(
      appDb(),
      suggestion.id,
      await makeRequestContext(),
    )

    const secondArea = await createArea(appDb(), {
      name: 'Other SQL integration area',
      prefix: 'SQO',
    })
    await expect(
      appDb().query(
        `UPDATE rfi_question_suggestions
         SET area_id = @1,
             rfi_question_id = NULL,
             source_specification_code = N'CHANGED',
             source_specification_name = N'Changed source',
             content = N'Changed evidence'
         WHERE id = @0`,
        [suggestion.id, secondArea.id],
      ),
    ).rejects.toThrow('evidence mutation')
    await expect(
      appDb().query(
        `UPDATE rfi_question_suggestions
         SET review_requested_at = DATEADD(second, 1, review_requested_at)
         WHERE id = @0`,
        [suggestion.id],
      ),
    ).rejects.toThrow('evidence mutation')
    await expect(
      appDb().query('DELETE FROM rfi_question_suggestions WHERE id = @0', [
        suggestion.id,
      ]),
    ).rejects.toThrow('Only draft')
  })

  it('returns one success and reason-coded conflicts for repeated and simultaneous reviews', async () => {
    const fixture = await createFixture(appDb())
    const repeated = await createAuditedDraft(
      appDb(),
      fixture,
      'Repeated review',
    )
    const firstReview = await requestRfiQuestionSuggestionReviewWithAudit(
      appDb(),
      repeated.id,
      await makeRequestContext(),
    )

    await expect(
      requestRfiQuestionSuggestionReviewWithAudit(
        appDb(),
        repeated.id,
        await makeRequestContext(),
      ),
    ).rejects.toMatchObject({
      details: {
        reason: 'rfi_question_suggestion_review_already_requested',
      },
      status: 409,
    })
    const afterRepeated = (await appDb().query(
      `SELECT review_requested_at AS reviewRequestedAt
       FROM rfi_question_suggestions
       WHERE id = @0`,
      [repeated.id],
    )) as Array<{ reviewRequestedAt: Date }>
    expect(afterRepeated[0]?.reviewRequestedAt.toISOString()).toBe(
      firstReview.reviewRequestedAt,
    )

    const simultaneous = await createAuditedDraft(
      appDb(),
      fixture,
      'Simultaneous review',
    )
    const results = await Promise.allSettled([
      requestRfiQuestionSuggestionReviewWithAudit(
        appDb(),
        simultaneous.id,
        await makeRequestContext(),
      ),
      requestRfiQuestionSuggestionReviewWithAudit(
        appDb(),
        simultaneous.id,
        await makeRequestContext(),
      ),
    ])

    expect(
      results.filter(result => result.status === 'fulfilled'),
    ).toHaveLength(1)
    expect(results.map(rejectedReason)).toContain(
      'rfi_question_suggestion_review_already_requested',
    )
    expect(
      await countAuditRows(appDb(), 'rfi_question_suggestion.request_review'),
    ).toBe(2)
  })

  it('requires review and commits only one of two competing resolutions', async () => {
    const fixture = await createFixture(appDb())
    const suggestion = await createAuditedDraft(
      appDb(),
      fixture,
      'Competing resolution',
    )

    await expect(
      resolveRfiQuestionSuggestionWithAudit(
        appDb(),
        suggestion.id,
        { resolution: 1, resolutionMotivation: 'Too early.' },
        actor,
        await makeRequestContext(),
      ),
    ).rejects.toMatchObject({
      details: { reason: 'rfi_question_suggestion_review_required' },
      status: 409,
    })

    await requestRfiQuestionSuggestionReviewWithAudit(
      appDb(),
      suggestion.id,
      await makeRequestContext(),
    )
    const results = await Promise.allSettled([
      resolveRfiQuestionSuggestionWithAudit(
        appDb(),
        suggestion.id,
        { resolution: 1, resolutionMotivation: 'Handled.' },
        actor,
        await makeRequestContext(),
      ),
      resolveRfiQuestionSuggestionWithAudit(
        appDb(),
        suggestion.id,
        { resolution: 2, resolutionMotivation: 'Dismissed.' },
        actor,
        await makeRequestContext(),
      ),
    ])

    expect(
      results.filter(result => result.status === 'fulfilled'),
    ).toHaveLength(1)
    expect(results.map(rejectedReason)).toContain(
      'rfi_question_suggestion_already_resolved',
    )
    expect(
      await countAuditRows(appDb(), 'rfi_question_suggestion.resolve'),
    ).toBe(1)
  })

  it('serializes delete against review with stable not-found or conflict outcomes', async () => {
    const fixture = await createFixture(appDb())
    const suggestion = await createAuditedDraft(
      appDb(),
      fixture,
      'Delete versus review',
    )
    const context = await makeRequestContext()
    const results = await Promise.allSettled([
      deleteRfiQuestionSuggestionWithAudit(appDb(), suggestion.id, context),
      requestRfiQuestionSuggestionReviewWithAudit(
        appDb(),
        suggestion.id,
        await makeRequestContext(),
      ),
    ])

    expect(
      results.filter(result => result.status === 'fulfilled'),
    ).toHaveLength(1)
    const rejection = results.find(result => result.status === 'rejected')
    expect(rejection).toBeDefined()
    if (rejection?.status === 'rejected') {
      expect(isRequirementsServiceError(rejection.reason)).toBe(true)
      if (isRequirementsServiceError(rejection.reason)) {
        expect([404, 409]).toContain(rejection.reason.status)
        if (rejection.reason.status === 409) {
          expect(rejection.reason.details?.reason).toBe(
            'rfi_question_suggestion_not_draft',
          )
        }
      }
    }
    const transitionAuditCount =
      (await countAuditRows(
        appDb(),
        'rfi_question_suggestion.request_review',
      )) + (await countAuditRows(appDb(), 'rfi_question_suggestion.delete'))
    expect(transitionAuditCount).toBe(1)
  })

  it('allows actor anonymization and specification cleanup without changing evidence', async () => {
    const fixture = await createFixture(appDb())
    const suggestion = await createAuditedDraft(
      appDb(),
      fixture,
      'Privacy-compatible evidence',
    )
    const reviewed = await requestRfiQuestionSuggestionReviewWithAudit(
      appDb(),
      suggestion.id,
      await makeRequestContext(),
    )
    await resolveRfiQuestionSuggestionWithAudit(
      appDb(),
      suggestion.id,
      { resolution: 1, resolutionMotivation: 'Handled safely.' },
      actor,
      await makeRequestContext(),
    )

    await appDb().query(
      `UPDATE rfi_question_suggestions
       SET created_by_hsa_id = NULL,
           created_by_display_name = N'Deleted user',
           resolved_by_hsa_id = NULL,
           resolved_by_display_name = N'Deleted user'
       WHERE id = @0`,
      [suggestion.id],
    )
    await appDb().query(
      'DELETE FROM requirements_specifications WHERE id = @0',
      [fixture.specification.id],
    )

    const rows = (await appDb().query(
      `SELECT
         content,
         created_by_hsa_id AS createdByHsaId,
         resolution,
         resolved_by_hsa_id AS resolvedByHsaId,
         review_requested_at AS reviewRequestedAt,
         specification_id AS specificationId
       FROM rfi_question_suggestions
       WHERE id = @0`,
      [suggestion.id],
    )) as Array<{
      content: string
      createdByHsaId: string | null
      resolution: number
      resolvedByHsaId: string | null
      reviewRequestedAt: Date
      specificationId: number | null
    }>
    expect(rows[0]).toMatchObject({
      content: 'Privacy-compatible evidence',
      createdByHsaId: null,
      resolution: 1,
      resolvedByHsaId: null,
      specificationId: null,
    })
    expect(rows[0]?.reviewRequestedAt.toISOString()).toBe(
      reviewed.reviewRequestedAt,
    )
  })

  it('rolls back all four mutations when the action-log insert fails', async () => {
    const fixture = await createFixture(appDb())
    const reviewDraft = await createRfiQuestionSuggestion(
      appDb(),
      {
        areaId: fixture.area.id,
        content: 'Review rollback',
        rfiQuestionId: fixture.questionId,
        specificationId: fixture.specification.id,
      },
      actor,
    )
    const resolutionDraft = await createRfiQuestionSuggestion(
      appDb(),
      {
        areaId: fixture.area.id,
        content: 'Resolution rollback',
        rfiQuestionId: fixture.questionId,
        specificationId: fixture.specification.id,
      },
      actor,
    )
    await requestRfiQuestionSuggestionReview(appDb(), resolutionDraft.id)
    const deleteDraft = await createRfiQuestionSuggestion(
      appDb(),
      {
        areaId: fixture.area.id,
        content: 'Delete rollback',
        rfiQuestionId: fixture.questionId,
        specificationId: fixture.specification.id,
      },
      actor,
    )

    await appDb().query(
      `CREATE TRIGGER fail_rfi_question_suggestion_audit
       ON action_audit_events
       AFTER INSERT
       AS
       BEGIN
         SET NOCOUNT ON;
         IF EXISTS (
           SELECT 1
           FROM inserted
           WHERE target_kind = N'rfi_question_suggestion'
         )
           THROW 51019, 'Injected RFI action-log failure', 1;
       END`,
    )

    try {
      const context = await makeRequestContext()
      await expect(
        createRfiQuestionSuggestionWithAudit(
          appDb(),
          {
            areaId: fixture.area.id,
            content: 'Create rollback',
            rfiQuestionId: fixture.questionId,
            specificationId: fixture.specification.id,
          },
          actor,
          context,
        ),
      ).rejects.toThrow('Injected RFI action-log failure')
      await expect(
        requestRfiQuestionSuggestionReviewWithAudit(
          appDb(),
          reviewDraft.id,
          await makeRequestContext(),
        ),
      ).rejects.toThrow('Injected RFI action-log failure')
      await expect(
        resolveRfiQuestionSuggestionWithAudit(
          appDb(),
          resolutionDraft.id,
          { resolution: 1, resolutionMotivation: 'Rollback.' },
          actor,
          await makeRequestContext(),
        ),
      ).rejects.toThrow('Injected RFI action-log failure')
      await expect(
        deleteRfiQuestionSuggestionWithAudit(
          appDb(),
          deleteDraft.id,
          await makeRequestContext(),
        ),
      ).rejects.toThrow('Injected RFI action-log failure')
    } finally {
      await appDb().query(
        'DROP TRIGGER IF EXISTS fail_rfi_question_suggestion_audit',
      )
    }

    const rows = (await appDb().query(
      `SELECT
         content,
         is_review_requested AS isReviewRequested,
         resolution
       FROM rfi_question_suggestions
       ORDER BY id`,
    )) as Array<{
      content: string
      isReviewRequested: boolean | number
      resolution: number | null
    }>
    expect(rows).toEqual([
      {
        content: 'Review rollback',
        isReviewRequested: false,
        resolution: null,
      },
      {
        content: 'Resolution rollback',
        isReviewRequested: true,
        resolution: null,
      },
      {
        content: 'Delete rollback',
        isReviewRequested: false,
        resolution: null,
      },
    ])
    expect(await countAuditRows(appDb())).toBe(0)
  })
})
