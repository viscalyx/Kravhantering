import { describe, expect, it } from 'vitest'
import { traverseActionAuditEventsForCsv } from '@/lib/audit/action-audit'
import type { SqlServerDatabase } from '@/lib/db'
import { useSqlIntegrationDatabase } from './helpers/sql-test-database'

describe('Action-log CSV export traversal', () => {
  const appDb = useSqlIntegrationDatabase()

  it('keeps filtered multi-page equal-time order inside the identity anchor', async () => {
    await appDb().query(
      `;WITH numbers AS (
         SELECT 1 AS value
         UNION ALL
         SELECT value + 1 FROM numbers WHERE value < 250
       )
       INSERT INTO action_audit_events (
         occurred_at,
         actor_hsa_id,
         actor_display_name,
         actor_kind,
         actor_client_id,
         action,
         target_kind,
         target_id,
         target_unique_id,
         decision,
         denial_reason,
         request_id,
         correlation_id,
         client_ip,
         details_json
       )
       SELECT
         DATEADD(
           millisecond,
           value,
           CONVERT(datetime2(3), '2026-07-25T10:00:00.000')
         ),
         N'SE5560000001-export1',
         N'Export Test',
         N'user',
         NULL,
         N'test.export',
         N'Requirement',
         CONVERT(nvarchar(255), value),
         CONCAT(N'REQ-', value),
         N'allowed',
         NULL,
         CONCAT(N'request-', value),
         N'export-correlation',
         N'203.0.113.40',
         NULL
       FROM numbers
       OPTION (MAXRECURSION 250)`,
    )
    await appDb().query(
      `INSERT INTO action_audit_events (
         occurred_at, actor_kind, action, target_kind, target_id, decision
       ) VALUES (
         '2026-07-25T10:00:00.000', N'system', N'other.action',
         N'Requirement', N'outside-filter', N'allowed'
       )`,
    )

    let insertedAfterAnchor = false
    const anchoredDb = {
      query: async <T = unknown[]>(
        sql: string,
        parameters?: unknown[],
      ): Promise<T> => {
        const result = await appDb().query<T>(sql, parameters)
        if (
          !insertedAfterAnchor &&
          sql.includes('SELECT MAX(id) AS anchorId')
        ) {
          insertedAfterAnchor = true
          await appDb().query(
            `INSERT INTO action_audit_events (
               occurred_at, actor_hsa_id, actor_display_name, actor_kind,
               action, target_kind, target_id, target_unique_id, decision,
               request_id, correlation_id, client_ip
             ) VALUES (
               '2026-07-25T10:00:00.000', N'SE5560000001-export1',
               N'Export Test', N'user', N'test.export', N'Requirement',
               N'after-anchor', N'REQ-LATE', N'allowed', N'request-late',
               N'export-correlation', N'203.0.113.40'
             )`,
          )
        }
        return result
      },
    } as SqlServerDatabase
    const targetIds: string[] = []

    await traverseActionAuditEventsForCsv(
      anchoredDb,
      {
        action: 'test.export',
        actorHsaId: 'SE5560000001-export1',
        clientIp: '203.0.113.40',
        decision: 'allowed',
        from: new Date('2026-07-25T09:00:00Z'),
        targetKind: 'Requirement',
        to: new Date('2026-07-25T11:00:00Z'),
      },
      {
        maxItems: 500,
        signal: new AbortController().signal,
        writeRow: async row => {
          targetIds.push(row.split(';')[7] ?? '')
        },
      },
    )

    expect(targetIds).toHaveLength(250)
    expect(targetIds).toEqual(
      Array.from({ length: 250 }, (_, index) => String(250 - index)),
    )
    expect(new Set(targetIds).size).toBe(250)
    expect(targetIds).not.toContain('after-anchor')
    expect(targetIds).not.toContain('outside-filter')
  })
})
