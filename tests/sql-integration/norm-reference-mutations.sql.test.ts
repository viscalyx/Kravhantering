import { describe, expect, it } from 'vitest'
import { createNormReferenceWithAudit } from '@/lib/requirements/norm-reference-mutations'
import {
  makeRequestContext,
  useSqlIntegrationDatabase,
} from './sql-test-database'

describe('norm-reference audited mutations', () => {
  const appDb = useSqlIntegrationDatabase()

  it('rolls back the business row when the action-log insert fails', async () => {
    await appDb().query(
      `CREATE TRIGGER fail_norm_reference_create_audit
       ON action_audit_events
       AFTER INSERT
       AS
       BEGIN
         SET NOCOUNT ON;
         IF EXISTS (
           SELECT 1 FROM inserted WHERE action = 'norm_reference.create'
         )
           THROW 51000, 'Injected action-log failure', 1;
       END`,
    )

    try {
      await expect(
        createNormReferenceWithAudit(
          appDb(),
          {
            issuer: 'Test issuer',
            name: 'Rollback reference',
            normReferenceId: 'ROLLBACK-595',
            reference: 'Section 595',
            type: 'Test',
          },
          await makeRequestContext(),
        ),
      ).rejects.toThrow('Injected action-log failure')
    } finally {
      await appDb().query(
        'DROP TRIGGER IF EXISTS fail_norm_reference_create_audit',
      )
    }

    const rows = (await appDb().query(
      `SELECT COUNT(*) AS count
       FROM norm_references
       WHERE norm_reference_id = @0`,
      ['ROLLBACK-595'],
    )) as Array<{ count: number }>
    expect(Number(rows[0]?.count ?? 0)).toBe(0)
  })

  it('generates unique IDs atomically for concurrent creates and commits both audit rows', async () => {
    const data = {
      issuer: 'Riksdagen',
      name: 'Concurrent norm reference',
      reference: 'SFS 2026:529',
      type: 'Lag',
    }
    const [firstContext, secondContext] = await Promise.all([
      makeRequestContext(),
      makeRequestContext(),
    ])

    const [first, second] = await Promise.all([
      createNormReferenceWithAudit(appDb(), data, firstContext),
      createNormReferenceWithAudit(appDb(), data, secondContext),
    ])

    expect([first.normReferenceId, second.normReferenceId].sort()).toEqual([
      'SFS-2026-529',
      'SFS-2026-529-2',
    ])

    const auditRows = (await appDb().query(
      `SELECT COUNT(*) AS count
       FROM action_audit_events
       WHERE action = @0 AND target_kind = @1`,
      ['norm_reference.create', 'norm_reference'],
    )) as Array<{ count: number }>
    expect(Number(auditRows[0]?.count ?? 0)).toBe(2)
  })
})
