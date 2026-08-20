import { describe, expect, it } from 'vitest'
import {
  AI_MODEL_HEALTH_EVIDENCE_MAX_AGE_MS,
  effectiveAiModelHealthStatus,
} from '@/lib/ai/operational-health'

describe('AI model operational health', () => {
  const now = new Date('2026-08-19T12:00:00.000Z')

  it('projects absent, invalid, future, and older-than-24-hour evidence as unknown', () => {
    for (const lastHealthEvidenceAt of [
      null,
      'invalid',
      new Date(now.getTime() + 1),
      new Date(now.getTime() - AI_MODEL_HEALTH_EVIDENCE_MAX_AGE_MS - 1),
    ]) {
      expect(
        effectiveAiModelHealthStatus({
          lastHealthEvidenceAt,
          now,
          persistedStatus: 'healthy',
        }),
      ).toBe('unknown')
    }
  })

  it('preserves fresh operational evidence independently of lifecycle state', () => {
    expect(
      effectiveAiModelHealthStatus({
        lastHealthEvidenceAt: new Date(
          now.getTime() - AI_MODEL_HEALTH_EVIDENCE_MAX_AGE_MS,
        ),
        now,
        persistedStatus: 'degraded',
      }),
    ).toBe('degraded')
  })

  it('projects evidence as unknown when the comparison date is invalid', () => {
    expect(
      effectiveAiModelHealthStatus({
        lastHealthEvidenceAt: now,
        now: new Date(Number.NaN),
        persistedStatus: 'healthy',
      }),
    ).toBe('unknown')
  })
})
