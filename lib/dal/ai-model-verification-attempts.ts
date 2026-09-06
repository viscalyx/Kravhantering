import { randomUUID } from 'node:crypto'
import {
  type AiModelVerificationAttempt,
  AiModelVerificationAttemptError,
  type AiModelVerificationAttemptStore,
} from '@/lib/ai/model-verification-attempts'
import type { SqlServerDatabase, SqlServerEntityManager } from '@/lib/db'

export const AI_VERIFICATION_PAYLOAD_MAX_BYTES = 65_536
const AI_VERIFICATION_MAX_PENDING_ATTEMPTS = 512

interface AttemptRow {
  connectionId: string
  expired: number
  expiresAt: Date
  fingerprint: string
  id: string
  payload: string
}

const COLUMNS = `[id], [ai_connection_id] AS [connectionId], [fingerprint],
  [payload_json] AS [payload], [expires_at] AS [expiresAt],
  CASE WHEN [expires_at] <= SYSUTCDATETIME() THEN 1 ELSE 0 END AS [expired]`

/** No reservation is committed separately: deletion is owned by the model-save transaction. */
export function createSqlServerAiModelVerificationAttemptStore<TResult>(
  db: SqlServerDatabase,
  parse: (value: unknown) => TResult,
): AiModelVerificationAttemptStore<TResult, SqlServerEntityManager> {
  const decode = (
    row: AttemptRow,
  ): Readonly<AiModelVerificationAttempt<TResult>> => ({
    id: row.id.toLowerCase(),
    connectionId: row.connectionId.toLowerCase(),
    fingerprint: row.fingerprint,
    expiresAt: row.expiresAt.toISOString(),
    result: parse(JSON.parse(row.payload)),
  })
  const store: AiModelVerificationAttemptStore<
    TResult,
    SqlServerEntityManager
  > = {
    async create(input) {
      const payload = JSON.stringify(parse(input.result))
      if (
        Buffer.byteLength(payload, 'utf16le') >
        AI_VERIFICATION_PAYLOAD_MAX_BYTES
      ) {
        throw new AiModelVerificationAttemptError('attempt_payload_invalid')
      }
      return db.transaction(async manager => {
        if (manager.queryRunner)
          manager.queryRunner.data.aiModelVerification = true
        const locks = await manager.query<{ result: number }[]>(`
          DECLARE @result int;
          EXEC @result = sys.sp_getapplock @Resource = N'ai_model_verification_capacity',
            @LockMode = N'Exclusive', @LockOwner = N'Transaction', @LockTimeout = 5000;
          SELECT @result AS result;`)
        if (!locks[0] || locks[0].result < 0)
          throw new AiModelVerificationAttemptError('attempt_capacity')
        const counts = await manager.query<{ count: number }[]>(`
          SELECT COUNT(*) AS count FROM [ai_model_verification_attempts] WITH (READCOMMITTEDLOCK)
          WHERE [expires_at] > SYSUTCDATETIME()`)
        if (counts[0].count >= AI_VERIFICATION_MAX_PENDING_ATTEMPTS)
          throw new AiModelVerificationAttemptError('attempt_capacity')
        const rows = await manager.query<AttemptRow[]>(
          `
          DECLARE @created_at datetime2 = SYSUTCDATETIME();
          INSERT INTO [ai_model_verification_attempts]
            ([id], [ai_connection_id], [fingerprint], [payload_json], [created_at], [expires_at])
          VALUES (@0, @1, @2, @3, @created_at, DATEADD(minute, 15, @created_at));
          SELECT ${COLUMNS} FROM [ai_model_verification_attempts] WHERE [id] = @0`,
          [randomUUID(), input.connectionId, input.fingerprint, payload],
        )
        return decode(rows[0])
      })
    },
    async list(connectionId) {
      const rows = await db.query<AttemptRow[]>(
        `
        SELECT TOP (${AI_VERIFICATION_MAX_PENDING_ATTEMPTS}) ${COLUMNS} FROM [ai_model_verification_attempts]
        WHERE [ai_connection_id] = @0 AND [expires_at] > SYSUTCDATETIME()
        ORDER BY [expires_at], [id]`,
        [connectionId],
      )
      return rows.map(decode)
    },
    async discard(input) {
      await db.query(
        `DELETE FROM [ai_model_verification_attempts] WITH (ROWLOCK, NOWAIT)
        WHERE [id] = @0 AND [ai_connection_id] = @1`,
        [input.attemptId, input.connectionId],
      )
    },
    async consume(input, manager) {
      if (!manager.queryRunner?.isTransactionActive)
        throw new Error('Model verification requires a transaction.')
      let rows: AttemptRow[]
      try {
        rows = await manager.query<AttemptRow[]>(
          `
          SELECT ${COLUMNS} FROM [ai_model_verification_attempts] WITH (XLOCK, ROWLOCK, NOWAIT)
          WHERE [id] = @0 AND [ai_connection_id] = @1`,
          [input.attemptId, input.connectionId],
        )
      } catch {
        // Lock contention and SQL failures expose only a bounded, retry-safe conflict.
        throw new AiModelVerificationAttemptError('attempt_unavailable')
      }
      const row = rows[0]
      if (!row) throw new AiModelVerificationAttemptError('attempt_unavailable')
      if (row.fingerprint !== input.fingerprint)
        throw new AiModelVerificationAttemptError('attempt_mismatch')
      if (row.expired)
        throw new AiModelVerificationAttemptError('attempt_expired')
      const attempt = decode(row)
      await manager.query(
        'DELETE FROM [ai_model_verification_attempts] WHERE [id] = @0',
        [input.attemptId],
      )
      return attempt
    },
  }
  async function bounded<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work()
    } catch (error) {
      if (error instanceof AiModelVerificationAttemptError) throw error
      throw new AiModelVerificationAttemptError('attempt_unavailable')
    }
  }
  return {
    create: input => bounded(() => store.create(input)),
    list: connectionId => bounded(() => store.list(connectionId)),
    discard: input => bounded(() => store.discard(input)),
    consume: (input, transaction) =>
      bounded(() => store.consume(input, transaction)),
  }
}
