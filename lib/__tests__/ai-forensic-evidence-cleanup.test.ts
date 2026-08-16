import { describe, expect, it, vi } from 'vitest'
import { purgeExpiredAiForensicEvidence } from '@/lib/transient-cleanup/ai-forensic-evidence'

describe('AI forensic evidence cleanup', () => {
  it('audits expiry and purge with metadata only', async () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
    const query = vi
      .fn()
      .mockResolvedValueOnce([
        {
          captureWindowId: 47,
          direction: 'output',
          expiresAt: '2026-08-15T14:00:00.000Z',
          operation: 'ai.generate-requirement-import',
        },
      ])
      .mockResolvedValueOnce([
        {
          captureWindowId: 46,
          direction: 'input',
          operation: 'ai.repair-requirement-import-json',
        },
        {
          captureWindowId: 46,
          direction: 'input',
          operation: 'ai.repair-requirement-import-json',
        },
        {
          captureWindowId: 46,
          direction: 'input',
          operation: 'ai.repair-requirement-import-json',
        },
      ])
      .mockResolvedValueOnce([
        {
          captureWindowId: 46,
          direction: 'input',
          operation: 'ai.repair-requirement-import-json',
        },
      ])

    try {
      await expect(
        purgeExpiredAiForensicEvidence({ query }, 10),
      ).resolves.toEqual({ deletedRows: 3 })

      const securityAuditEvents = infoSpy.mock.calls
        .map(([message]) => JSON.parse(String(message)))
        .filter(event => event.channel === 'security-audit')
      expect(securityAuditEvents).toEqual([
        expect.objectContaining({
          detail: expect.objectContaining({ captureWindowId: 47 }),
          event: 'ai.forensic_capture.expired',
        }),
        expect.objectContaining({
          detail: expect.objectContaining({
            captureWindowId: 46,
            deletedRows: 3,
          }),
          event: 'ai.forensic_evidence.purged',
        }),
      ])
      expect(JSON.stringify(infoSpy.mock.calls)).not.toContain(
        'raw-evidence-content',
      )
    } finally {
      infoSpy.mockRestore()
    }
  })
})
