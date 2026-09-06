import { randomUUID } from 'node:crypto'
import { DataSource } from 'typeorm'
import {
  type AiModelVerificationAttempt,
  AiModelVerificationAttemptError,
  type AiModelVerificationAttemptStore,
} from '@/lib/ai/model-verification-attempts'
import type { AiModelVerificationPayload } from '@/lib/ai/model-verification-payload'
import type { SqlServerEntityManager } from '@/lib/db'

/** Explicit test double; SQL integration tests own transactional concurrency coverage. */
export function createTestAiVerificationAttemptStore(): AiModelVerificationAttemptStore<
  AiModelVerificationPayload,
  SqlServerEntityManager
> & {
  transaction<T>(
    work: (manager: SqlServerEntityManager) => Promise<T>,
  ): Promise<T>
} {
  let attempts = new Map<
    string,
    AiModelVerificationAttempt<AiModelVerificationPayload>
  >()
  return {
    async create(input) {
      const attempt = {
        ...input,
        id: randomUUID(),
        expiresAt: new Date(Date.now() + 900_000).toISOString(),
      }
      attempts.set(attempt.id, attempt)
      return attempt
    },
    async list(connectionId) {
      return [...attempts.values()].filter(
        attempt => attempt.connectionId === connectionId,
      )
    },
    async discard({ connectionId, attemptId }) {
      if (attempts.get(attemptId)?.connectionId === connectionId)
        attempts.delete(attemptId)
    },
    async consume(input) {
      const attempt = attempts.get(input.attemptId)
      if (!attempt || attempt.connectionId !== input.connectionId)
        throw new AiModelVerificationAttemptError('attempt_unavailable')
      if (attempt.fingerprint !== input.fingerprint)
        throw new AiModelVerificationAttemptError('attempt_mismatch')
      attempts.delete(input.attemptId)
      return attempt
    },
    async transaction(work) {
      const original = new Map(attempts)
      try {
        return await work(new DataSource({ type: 'mssql' }).manager)
      } catch (error) {
        attempts = original
        throw error
      }
    },
  }
}
