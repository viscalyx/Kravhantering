import { QueryFailedError } from 'typeorm'
import { describe, expect, it, vi } from 'vitest'
import { createSqlServerAiModelVerificationAttemptStore } from '@/lib/dal/ai-model-verification-attempts'
import type { SqlServerDatabase, SqlServerEntityManager } from '@/lib/db'
import { toHttpErrorPayload } from '@/lib/requirements/http-errors'

describe('model verification SQL failure propagation', () => {
  it('keeps an unknown transaction-completion failure out of retry-safe attempt conflicts', async () => {
    const cause = new Error(
      'Commit acknowledgement unavailable PRIVATE_CANDIDATE',
    )
    const db = {
      transaction: vi.fn().mockRejectedValue(cause),
    } as unknown as SqlServerDatabase
    const store = createSqlServerAiModelVerificationAttemptStore(
      db,
      value => value,
    )
    const error = await store
      .discard({ connectionId: 'connection', attemptId: 'attempt' })
      .then(
        () => undefined,
        error => error,
      )
    expect(error).toMatchObject({ code: 'internal', status: 500, cause })
    const response = toHttpErrorPayload(error)
    expect(response).toMatchObject({ status: 500, body: { code: 'internal' } })
    expect(JSON.stringify(response.body)).not.toMatch(
      /PRIVATE_CANDIDATE|Commit acknowledgement/,
    )
  })

  it.each(['create', 'list', 'discard', 'consume'] as const)(
    'preserves protected SQL failures from the actual %s store boundary',
    async operation => {
      const log = vi.spyOn(console, 'error').mockImplementation(() => {})
      const sqlError = new QueryFailedError(
        "SELECT 'PRIVATE_CANDIDATE' FROM ai_connections",
        ['PRIVATE_CANDIDATE'],
        Object.assign(new Error('PRIVATE_CANDIDATE truncated'), {
          number: 2628,
        }),
      )
      const manager = {
        query: vi.fn().mockRejectedValue(sqlError),
        queryRunner: { data: {}, isTransactionActive: true },
      } as unknown as SqlServerEntityManager
      const db = {
        query: manager.query,
        transaction: async (
          work: (manager: SqlServerEntityManager) => unknown,
        ) => work(manager),
      } as unknown as SqlServerDatabase
      const store = createSqlServerAiModelVerificationAttemptStore(
        db,
        value => value,
      )
      const input = {
        connectionId: 'connection',
        attemptId: 'attempt',
        fingerprint: 'a'.repeat(64),
        result: {},
      }
      try {
        const result =
          operation === 'create'
            ? store.create(input)
            : operation === 'list'
              ? store.list(input.connectionId)
              : operation === 'discard'
                ? store.discard(input)
                : store.consume(input, manager)
        const error = await result.then(
          () => undefined,
          error => error,
        )
        expect(error).toBe(sqlError)
        const response = toHttpErrorPayload(error)
        expect(response).toMatchObject({
          status: 500,
          body: {
            code: 'sql_failure',
            correlationId: expect.any(String),
            timestamp: expect.any(String),
          },
        })
        expect(JSON.stringify(log.mock.calls)).not.toMatch(
          /PRIVATE_CANDIDATE|SELECT|ai_connections/,
        )
        expect(JSON.parse(String(log.mock.calls[0][0]))).toMatchObject({
          correlation_id: response.body.correlationId,
          error: {
            message: 'Protected SQL operation failed',
            sql: { number: 2628 },
          },
        })
      } finally {
        log.mockRestore()
      }
    },
  )

  it('retains the verified NOWAIT lock-conflict contract without reporting a SQL failure', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const manager = {
      query: vi.fn().mockRejectedValue(
        new QueryFailedError(
          'SELECT id FROM ai_model_verification_attempts',
          [],
          Object.assign(new Error('Lock request time out period exceeded'), {
            number: 1222,
          }),
        ),
      ),
      queryRunner: { data: {}, isTransactionActive: true },
    } as unknown as SqlServerEntityManager
    const store = createSqlServerAiModelVerificationAttemptStore(
      {} as SqlServerDatabase,
      value => value,
    )
    try {
      await expect(
        store.consume(
          {
            connectionId: 'connection',
            attemptId: 'attempt',
            fingerprint: 'a'.repeat(64),
          },
          manager,
        ),
      ).rejects.toMatchObject({ code: 'attempt_unavailable' })
      expect(log).not.toHaveBeenCalled()
    } finally {
      log.mockRestore()
    }
  })
})
