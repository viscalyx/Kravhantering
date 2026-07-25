import { describe, expect, it } from 'vitest'
import {
  cancelAccessReviewRun,
  completeAccessReviewRun,
  decideAccessReviewItem,
} from '@/lib/access-review/service'
import {
  type QueryExecutor,
  recordActionAuditEvent,
} from '@/lib/audit/action-audit'
import type { SqlServerDatabase } from '@/lib/db'
import { useSqlIntegrationDatabase } from './helpers/sql-test-database'

const actor = {
  displayName: 'Ada Admin',
  hsaId: 'SE5560000001-admin1',
  roles: ['Admin'],
}

interface SeededReview {
  itemId: number
  runId: number
  updatedAt: Date
}

async function seedReview(
  db: SqlServerDatabase,
  decision: 'approved' | 'pending' = 'pending',
): Promise<SeededReview> {
  const updatedAt = new Date('2026-05-12T12:00:00.000Z')
  const runRows = (await db.query(
    `INSERT INTO access_review_runs (
        status,
        period_start,
        period_end,
        due_at,
        created_at,
        updated_at,
        created_by_hsa_id,
        created_by_display_name,
        reviewer_hsa_id,
        reviewer_display_name
      )
      OUTPUT INSERTED.id AS id
      VALUES (
        N'in_review',
        @0,
        @1,
        @2,
        @0,
        @0,
        @3,
        @4,
        @3,
        @4
      )`,
    [
      updatedAt,
      new Date('2027-05-12T12:00:00.000Z'),
      new Date('2026-06-11T12:00:00.000Z'),
      actor.hsaId,
      actor.displayName,
    ],
  )) as Array<{ id: number }>
  const runId = Number(runRows[0]?.id)
  const decidedAt =
    decision === 'pending' ? null : new Date('2026-05-12T12:01:00.000Z')
  const itemRows = (await db.query(
    `INSERT INTO access_review_items (
        run_id,
        source_key,
        source_table,
        principal_hsa_id,
        principal_display_name,
        scope_type,
        scope_key,
        scope_label,
        permission_type,
        decision,
        decided_at,
        decided_by_hsa_id,
        decided_by_display_name,
        comment,
        created_at
      )
      OUTPUT INSERTED.id AS id
      VALUES (
        @0,
        N'requirement_areas.owner',
        N'requirement_areas',
        N'SE5560000001-owner1',
        N'Olivia Owner',
        N'requirement_area',
        N'1',
        N'INT Integration',
        N'area_owner',
        @1,
        @2,
        @3,
        @4,
        NULL,
        @5
      )`,
    [
      runId,
      decision,
      decidedAt,
      decision === 'pending' ? null : actor.hsaId,
      decision === 'pending' ? null : actor.displayName,
      updatedAt,
    ],
  )) as Array<{ id: number }>

  return { itemId: Number(itemRows[0]?.id), runId, updatedAt }
}

function successfulAudit(action: string) {
  return async (executor: QueryExecutor, detail: { runId: number }) => {
    await recordActionAuditEvent(executor, {
      action,
      actorDisplayName: actor.displayName,
      actorHsaId: actor.hsaId,
      actorKind: 'user',
      decision: 'allowed',
      details: { reviewId: detail.runId },
      targetId: detail.runId,
      targetKind: 'AccessReview',
    })
  }
}

async function failingAudit(executor: QueryExecutor): Promise<void> {
  // invalid_actor_kind is intentional; the actor_kind schema constraint should reject it and trigger rollback.
  await executor.query(
    `INSERT INTO action_audit_events (
        occurred_at,
        actor_kind,
        action,
        target_kind,
        decision
      )
      VALUES (@0, N'invalid_actor_kind', N'access_review.test_failure',
        N'AccessReview', N'allowed')`,
    [new Date()],
  )
}

async function reviewState(db: SqlServerDatabase, review: SeededReview) {
  const runRows = (await db.query(
    `SELECT
        status,
        updated_at AS updatedAt,
        completed_at AS completedAt
      FROM access_review_runs
      WHERE id = @0`,
    [review.runId],
  )) as Array<{
    completedAt: Date | null
    status: string
    updatedAt: Date
  }>
  const itemRows = (await db.query(
    `SELECT
        decision,
        comment,
        decided_at AS decidedAt
      FROM access_review_items
      WHERE id = @0`,
    [review.itemId],
  )) as Array<{
    comment: string | null
    decidedAt: Date | null
    decision: string
  }>
  const auditRows = (await db.query(
    `SELECT action
      FROM action_audit_events
      WHERE target_kind = N'AccessReview' AND target_id = @0
      ORDER BY id ASC`,
    [review.runId],
  )) as Array<{ action: string }>

  return {
    actions: auditRows.map(row => row.action),
    item: itemRows[0],
    run: runRows[0],
  }
}

describe('access review mutation serialization and rollback', () => {
  const appDb = useSqlIntegrationDatabase()

  it('serializes a decision against completion in either scheduler order', async () => {
    const review = await seedReview(appDb())

    const [decisionResult, completionResult] = await Promise.allSettled([
      decideAccessReviewItem(
        appDb(),
        review.runId,
        review.itemId,
        { comment: 'Still needed', decision: 'approved' },
        actor,
        { audit: successfulAudit('access_review.item_decide') },
      ),
      completeAccessReviewRun(appDb(), review.runId, actor, {
        audit: successfulAudit('access_review.complete'),
      }),
    ])

    expect(decisionResult.status).toBe('fulfilled')
    const state = await reviewState(appDb(), review)
    expect(state.item).toMatchObject({
      comment: 'Still needed',
      decision: 'approved',
    })
    if (completionResult.status === 'fulfilled') {
      expect(state.run?.status).toBe('completed')
      expect(state.actions).toEqual([
        'access_review.item_decide',
        'access_review.complete',
      ])
    } else {
      expect(completionResult.reason).toMatchObject({
        code: 'conflict',
        details: { reason: 'access_review_pending_items' },
      })
      expect(state.run?.status).toBe('in_review')
      expect(state.actions).toEqual(['access_review.item_decide'])
    }
  })

  it('serializes a decision against cancellation in either scheduler order', async () => {
    const review = await seedReview(appDb())

    const [decisionResult, cancellationResult] = await Promise.allSettled([
      decideAccessReviewItem(
        appDb(),
        review.runId,
        review.itemId,
        { decision: 'approved' },
        actor,
        { audit: successfulAudit('access_review.item_decide') },
      ),
      cancelAccessReviewRun(appDb(), review.runId, actor, {
        audit: successfulAudit('access_review.cancel'),
      }),
    ])

    expect(cancellationResult.status).toBe('fulfilled')
    const state = await reviewState(appDb(), review)
    expect(state.run?.status).toBe('cancelled')
    if (decisionResult.status === 'fulfilled') {
      expect(state.item?.decision).toBe('approved')
      expect(state.actions).toEqual([
        'access_review.item_decide',
        'access_review.cancel',
      ])
    } else {
      expect(decisionResult.reason).toMatchObject({
        code: 'conflict',
        details: {
          reason: 'access_review_closed',
          status: 'cancelled',
        },
      })
      expect(state.item?.decision).toBe('pending')
      expect(state.actions).toEqual(['access_review.cancel'])
    }
  })

  it('allows exactly one legal completion or cancellation winner', async () => {
    const review = await seedReview(appDb(), 'approved')

    const results = await Promise.allSettled([
      completeAccessReviewRun(appDb(), review.runId, actor, {
        audit: successfulAudit('access_review.complete'),
      }),
      cancelAccessReviewRun(appDb(), review.runId, actor, {
        audit: successfulAudit('access_review.cancel'),
      }),
    ])

    expect(
      results.filter(result => result.status === 'fulfilled'),
    ).toHaveLength(1)
    const rejected = results.find(result => result.status === 'rejected')
    expect(rejected).toBeDefined()
    const state = await reviewState(appDb(), review)
    if (state.run?.status === 'completed') {
      expect(rejected).toMatchObject({
        reason: {
          code: 'conflict',
          details: { reason: 'access_review_completed' },
        },
      })
      expect(state.actions).toEqual(['access_review.complete'])
    } else {
      expect(state.run?.status).toBe('cancelled')
      expect(rejected).toMatchObject({
        reason: {
          code: 'conflict',
          details: { reason: 'access_review_cancelled' },
        },
      })
      expect(state.actions).toEqual(['access_review.cancel'])
    }
  })

  it('rolls back a decision when its Action log insertion fails', async () => {
    const review = await seedReview(appDb())

    await expect(
      decideAccessReviewItem(
        appDb(),
        review.runId,
        review.itemId,
        { comment: 'Must roll back', decision: 'approved' },
        actor,
        { audit: failingAudit },
      ),
    ).rejects.toThrow()

    const state = await reviewState(appDb(), review)
    expect(state.item).toMatchObject({
      comment: null,
      decidedAt: null,
      decision: 'pending',
    })
    expect(state.run?.status).toBe('in_review')
    expect(state.run?.updatedAt.toISOString()).toBe(
      review.updatedAt.toISOString(),
    )
    expect(state.actions).toEqual([])
  })

  it('rolls back completion when its Action log insertion fails', async () => {
    const review = await seedReview(appDb(), 'approved')

    await expect(
      completeAccessReviewRun(appDb(), review.runId, actor, {
        audit: failingAudit,
      }),
    ).rejects.toThrow()

    const state = await reviewState(appDb(), review)
    expect(state.run).toMatchObject({
      completedAt: null,
      status: 'in_review',
    })
    expect(state.run?.updatedAt.toISOString()).toBe(
      review.updatedAt.toISOString(),
    )
    expect(state.actions).toEqual([])
  })

  it('rolls back cancellation when its Action log insertion fails', async () => {
    const review = await seedReview(appDb())

    await expect(
      cancelAccessReviewRun(appDb(), review.runId, actor, {
        audit: failingAudit,
      }),
    ).rejects.toThrow()

    const state = await reviewState(appDb(), review)
    expect(state.run?.status).toBe('in_review')
    expect(state.run?.updatedAt.toISOString()).toBe(
      review.updatedAt.toISOString(),
    )
    expect(state.actions).toEqual([])
  })
})
