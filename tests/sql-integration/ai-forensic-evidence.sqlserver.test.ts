import { describe, expect, it, vi } from 'vitest'
import {
  createAiForensicCaptureRequest,
  readStoppedAiForensicCaptureEvidence,
  transitionAiForensicCapture,
} from '@/lib/ai/forensic-capture'
import { persistAiForensicEvidence } from '@/lib/ai/forensic-evidence'
import type { AiSafetyScreeningResult } from '@/lib/ai/safety'
import type { RequestContext } from '@/lib/requirements/auth'
import { purgeExpiredAiForensicEvidence } from '@/lib/transient-cleanup/ai-forensic-evidence'
import { parseSecurityAuditEvents } from '@/tests/helpers/security-audit-events'
import { useSqlIntegrationDatabase } from './helpers/sql-test-database'

function context(
  hsaId: string,
  displayName: string,
  roles: RequestContext['actor']['roles'],
): RequestContext {
  return {
    actor: {
      displayName,
      hsaId,
      id: hsaId,
      isAuthenticated: true,
      roles,
      source: 'oidc',
    },
    correlationId: crypto.randomUUID(),
    request: {
      method: 'POST',
      path: '/sql-integration/ai-forensic-captures',
      requestId: crypto.randomUUID(),
    },
    requestId: crypto.randomUUID(),
    source: 'rest',
  }
}

const screening: AiSafetyScreeningResult = {
  contentParts: [
    {
      label: 'provider-output',
      text: 'Authorization: Bearer sql-secret SE5560000001-person1 person@example.test',
    },
  ],
  decision: {
    allowed: false,
    categories: ['backend_leakage'],
    primaryRuleId: 'sensitive_backend_leak',
    primaryRuleType: 'direct_markers',
    ruleIds: ['sensitive_backend_leak'],
    ruleTypes: ['direct_markers'],
    textLength: 80,
  },
  forensicEvidence: [],
}

describe('AI forensic evidence against SQL Server', () => {
  const appDb = useSqlIntegrationDatabase()

  it('accepts only inclusive five-to-sixty-minute capture windows', async () => {
    const insertWindow = (durationMilliseconds: number) =>
      appDb().query(
        `DECLARE @requestedAt datetime2(3) = SYSUTCDATETIME();
         INSERT INTO ai_forensic_capture_windows (
           operation, direction, requested_by_display_name, requested_at,
           expires_at, is_open, event_byte_limit, event_item_limit,
           collection_item_limit
         ) VALUES (
           N'ai.generate-requirement-import', N'input', N'Boundary Admin',
           @requestedAt, DATEADD(millisecond, @0, @requestedAt), NULL,
           8192, 8, 1000
         );`,
        [durationMilliseconds],
      )

    await insertWindow(5 * 60_000)
    await insertWindow(60 * 60_000)
    await expect(insertWindow(5 * 60_000 - 1)).rejects.toThrow(
      'chk_ai_forensic_capture_windows_expires_at',
    )
    await expect(insertWindow(60 * 60_000 + 1)).rejects.toThrow(
      'chk_ai_forensic_capture_windows_expires_at',
    )

    const rows = (await appDb().query(
      'SELECT COUNT_BIG(*) AS captureCount FROM ai_forensic_capture_windows',
    )) as Array<{ captureCount: number | string }>
    expect(Number(rows[0]?.captureCount)).toBe(2)
  })

  it('requires a different person to approve a capture request', async () => {
    const requester = context(
      'SE5560000001-forensic-two-person1',
      'Alex Administrator',
      ['Admin'],
    )
    const samePersonApprover = context(
      'SE5560000001-forensic-two-person1',
      'Alex Administrator',
      ['PrivacyOfficer'],
    )
    const capture = await createAiForensicCaptureRequest(appDb(), requester, {
      direction: 'input',
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      operation: 'ai.generate-requirement-import',
    })

    await expect(
      transitionAiForensicCapture(appDb(), samePersonApprover, {
        action: 'approve',
        captureWindowId: capture.id,
      }),
    ).rejects.toMatchObject({ code: 'conflict' })

    const rows = (await appDb().query(
      `SELECT approved_at AS approvedAt,
              approved_by_hsa_id AS approvedByHsaId,
              is_open AS isOpen
       FROM ai_forensic_capture_windows
       WHERE id = @0`,
      [capture.id],
    )) as Array<{
      approvedAt: Date | null
      approvedByHsaId: string | null
      isOpen: boolean
    }>
    expect(rows).toEqual([
      { approvedAt: null, approvedByHsaId: null, isOpen: true },
    ])
  })

  it('captures only in an approved window and purges it at the next activation', async () => {
    const admin = context('SE5560000001-forensic-admin1', 'Ada Admin', [
      'Admin',
    ])
    const privacyOfficer = context(
      'SE5560000001-forensic-privacy1',
      'Disa Privacy Officer',
      ['PrivacyOfficer'],
    )
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()
    const first = await createAiForensicCaptureRequest(appDb(), admin, {
      direction: 'output',
      expiresAt,
      operation: 'ai.generate-requirement-import',
    })

    await expect(
      persistAiForensicEvidence({
        blockedStep: 'final_model_output',
        context: admin,
        db: appDb(),
        direction: 'output',
        eventId: crypto.randomUUID(),
        operation: 'ai.generate-requirement-import',
        screening,
      }),
    ).resolves.toBe(false)
    await expect(
      transitionAiForensicCapture(appDb(), privacyOfficer, {
        action: 'approve',
        captureWindowId: first.id,
      }),
    ).resolves.toMatchObject({ status: 'active' })
    await expect(
      persistAiForensicEvidence({
        blockedStep: 'final_model_output',
        context: admin,
        db: appDb(),
        direction: 'output',
        eventId: crypto.randomUUID(),
        operation: 'ai.generate-requirement-import',
        screening,
      }),
    ).resolves.toBe(true)
    await appDb().query(
      `UPDATE ai_forensic_capture_windows
       SET collection_item_limit = 1 WHERE id = @0`,
      [first.id],
    )
    await expect(
      persistAiForensicEvidence({
        blockedStep: 'final_model_output',
        context: admin,
        db: appDb(),
        direction: 'output',
        eventId: crypto.randomUUID(),
        operation: 'ai.generate-requirement-import',
        screening,
      }),
    ).resolves.toBe(false)
    await transitionAiForensicCapture(appDb(), admin, {
      action: 'stop',
      captureWindowId: first.id,
    })

    const stopped = await readStoppedAiForensicCaptureEvidence(
      appDb(),
      admin,
      first.id,
    )
    expect(stopped.events).toHaveLength(1)
    expect(JSON.stringify(stopped.events)).not.toContain('sql-secret')
    expect(JSON.stringify(stopped.events)).not.toContain('SE5560000001-person1')
    expect(JSON.stringify(stopped.events)).not.toContain('person@example.test')
    const stored = (await appDb().query(
      `SELECT DATALENGTH(evidence_json) AS byteCount
       FROM ai_forensic_evidence_events
       WHERE ai_forensic_capture_window_id = @0`,
      [first.id],
    )) as Array<{ byteCount: number }>
    expect(Number(stored[0]?.byteCount)).toBeLessThanOrEqual(8192)

    const second = await createAiForensicCaptureRequest(appDb(), admin, {
      direction: 'input',
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      operation: 'ai.repair-requirement-import-json',
    })
    await transitionAiForensicCapture(appDb(), privacyOfficer, {
      action: 'approve',
      captureWindowId: second.id,
    })

    const oldRows = (await appDb().query(
      `SELECT capture.purged_at AS purgedAt, COUNT_BIG(evidence.id) AS eventCount
       FROM ai_forensic_capture_windows capture
       LEFT JOIN ai_forensic_evidence_events evidence
         ON evidence.ai_forensic_capture_window_id = capture.id
       WHERE capture.id = @0
       GROUP BY capture.purged_at`,
      [first.id],
    )) as Array<{ eventCount: number | string; purgedAt: Date | null }>
    expect(oldRows[0]?.purgedAt).toBeInstanceOf(Date)
    expect(Number(oldRows[0]?.eventCount)).toBe(0)
  })

  it('stops collection at SQL expiry and emits metadata-only expiry audit', async () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
    const admin = context('SE5560000001-forensic-admin2', 'Asta Admin', [
      'Admin',
    ])
    const privacyOfficer = context(
      'SE5560000001-forensic-privacy2',
      'Pia Privacy Officer',
      ['PrivacyOfficer'],
    )
    try {
      const capture = await createAiForensicCaptureRequest(appDb(), admin, {
        direction: 'output',
        expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        operation: 'ai.generate-requirement-import',
      })
      await transitionAiForensicCapture(appDb(), privacyOfficer, {
        action: 'approve',
        captureWindowId: capture.id,
      })
      await appDb().query(
        `UPDATE ai_forensic_capture_windows
         SET requested_at = DATEADD(minute, -10, SYSUTCDATETIME()),
             expires_at = DATEADD(minute, -1, SYSUTCDATETIME())
         WHERE id = @0`,
        [capture.id],
      )

      await expect(
        persistAiForensicEvidence({
          blockedStep: 'final_model_output',
          context: admin,
          db: appDb(),
          direction: 'output',
          eventId: crypto.randomUUID(),
          operation: 'ai.generate-requirement-import',
          screening,
        }),
      ).resolves.toBe(false)
      await expect(
        readStoppedAiForensicCaptureEvidence(appDb(), admin, capture.id),
      ).resolves.toMatchObject({ capture: { status: 'expired' }, events: [] })
      await purgeExpiredAiForensicEvidence(appDb(), 10)

      const expiryEvent = parseSecurityAuditEvents(infoSpy).find(
        event => event.event === 'ai.forensic_capture.expired',
      )
      expect(expiryEvent).toMatchObject({
        detail: { captureWindowId: capture.id },
      })
      expect(JSON.stringify(expiryEvent)).not.toContain('sql-secret')
    } finally {
      infoSpy.mockRestore()
    }
  })
})
