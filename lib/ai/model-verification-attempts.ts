import { randomUUID } from 'node:crypto'

const ATTEMPT_TTL_MS = 15 * 60 * 1000
const MAX_ATTEMPTS = 512

export type AiModelVerificationAttemptErrorCode =
  | 'attempt_expired'
  | 'attempt_mismatch'
  | 'attempt_unavailable'

export class AiModelVerificationAttemptError extends Error {
  readonly code: AiModelVerificationAttemptErrorCode

  constructor(code: AiModelVerificationAttemptErrorCode) {
    super(code)
    this.name = 'AiModelVerificationAttemptError'
    this.code = code
  }
}

export interface AiModelVerificationAttempt {
  actorKey: string
  connectionId: string
  expiresAt: string
  fingerprint: string
  id: string
  result: unknown
}

export interface AiModelVerificationAttemptLease {
  attempt: Readonly<AiModelVerificationAttempt>
  commit(): void
  release(): void
}

interface StoredAttempt extends AiModelVerificationAttempt {
  expiresAtMs: number
  reserved: boolean
}

export interface AiModelVerificationAttemptStore {
  create(input: {
    actorKey: string
    connectionId: string
    fingerprint: string
    result: unknown
  }): Readonly<AiModelVerificationAttempt>
  discard(input: { actorKey: string; attemptId: string }): boolean
  reserve(input: {
    actorKey: string
    attemptId: string
    connectionId: string
    fingerprint: string
  }): AiModelVerificationAttemptLease
}

export function createAiModelVerificationAttemptStore(
  options: { now?: () => number } = {},
): AiModelVerificationAttemptStore {
  const now = options.now ?? Date.now
  const attempts = new Map<string, StoredAttempt>()

  const publicAttempt = (
    attempt: StoredAttempt,
  ): Readonly<AiModelVerificationAttempt> => ({
    actorKey: attempt.actorKey,
    connectionId: attempt.connectionId,
    expiresAt: attempt.expiresAt,
    fingerprint: attempt.fingerprint,
    id: attempt.id,
    result: attempt.result,
  })

  return {
    create(input) {
      const currentTime = now()
      for (const [id, attempt] of attempts) {
        if (attempt.expiresAtMs <= currentTime) attempts.delete(id)
      }
      if (attempts.size >= MAX_ATTEMPTS) {
        const oldestId = attempts.keys().next().value as string | undefined
        if (oldestId) attempts.delete(oldestId)
      }
      const id = randomUUID()
      const expiresAtMs = currentTime + ATTEMPT_TTL_MS
      const attempt: StoredAttempt = {
        ...input,
        expiresAt: new Date(expiresAtMs).toISOString(),
        expiresAtMs,
        id,
        reserved: false,
      }
      attempts.set(id, attempt)
      return publicAttempt(attempt)
    },
    discard(input) {
      const attempt = attempts.get(input.attemptId)
      if (!attempt || attempt.actorKey !== input.actorKey) return false
      attempts.delete(input.attemptId)
      return true
    },
    reserve(input) {
      const attempt = attempts.get(input.attemptId)
      if (!attempt) {
        throw new AiModelVerificationAttemptError('attempt_unavailable')
      }
      if (attempt.expiresAtMs <= now()) {
        attempts.delete(input.attemptId)
        throw new AiModelVerificationAttemptError('attempt_expired')
      }
      if (
        attempt.actorKey !== input.actorKey ||
        attempt.connectionId !== input.connectionId ||
        attempt.fingerprint !== input.fingerprint
      ) {
        throw new AiModelVerificationAttemptError('attempt_mismatch')
      }
      if (attempt.reserved) {
        throw new AiModelVerificationAttemptError('attempt_unavailable')
      }
      attempt.reserved = true
      let settled = false
      return {
        attempt: publicAttempt(attempt),
        commit() {
          if (settled) return
          settled = true
          attempts.delete(input.attemptId)
        },
        release() {
          if (settled) return
          settled = true
          const current = attempts.get(input.attemptId)
          if (current === attempt) current.reserved = false
        },
      }
    },
  }
}

export const aiModelVerificationAttempts =
  createAiModelVerificationAttemptStore()
