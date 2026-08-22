import type { AiConnectionModelHealthStatus } from '@/lib/typeorm/entities/ai-connection-model-operational-state'

export const AI_MODEL_HEALTH_EVIDENCE_MAX_AGE_MS = 24 * 60 * 60 * 1_000

/**
 * Read-side health projection. Administrative lifecycle remains an independent
 * concern; absent or stale operational evidence is always shown as unknown.
 */
export function effectiveAiModelHealthStatus(input: {
  lastHealthEvidenceAt: Date | string | null
  now?: Date
  persistedStatus: AiConnectionModelHealthStatus
}): AiConnectionModelHealthStatus {
  if (input.lastHealthEvidenceAt === null) return 'unknown'
  const evidenceAt = new Date(input.lastHealthEvidenceAt).getTime()
  const now = (input.now ?? new Date()).getTime()
  if (
    !Number.isFinite(evidenceAt) ||
    !Number.isFinite(now) ||
    evidenceAt > now ||
    now - evidenceAt > AI_MODEL_HEALTH_EVIDENCE_MAX_AGE_MS
  ) {
    return 'unknown'
  }
  return input.persistedStatus
}
