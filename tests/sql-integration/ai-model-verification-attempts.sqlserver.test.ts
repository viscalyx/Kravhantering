import { fork } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { POST as modelConnectionAction } from '@/app/api/admin/ai-connections/[connectionId]/actions/route'
import { VERIFICATION } from '@/lib/__tests__/fixtures/ai-model-verification'
import { createAiConnectionAdministrationRuntime } from '@/lib/ai/admin-runtime'
import type { AiAdminExternalOperations } from '@/lib/ai/admin-service'
import { parseAiModelVerificationPayload } from '@/lib/ai/model-verification-payload'
import { resetAuthConfigForTests } from '@/lib/auth/config'
import { createSqlServerAiAdminStore } from '@/lib/dal/ai-connection-admin'
import { createSqlServerAiModelVerificationAttemptStore } from '@/lib/dal/ai-model-verification-attempts'
import { attachVerifiedActor } from '@/lib/requirements/auth'
import { toHttpErrorPayload } from '@/lib/requirements/http-errors'
import {
  inspectExpiredAiModelVerificationAttempts,
  purgeExpiredAiModelVerificationAttempts,
} from '@/lib/transient-cleanup/ai-model-verification-attempts'
import { AiVerificationSqlLogger } from '@/lib/typeorm/ai-verification-sql-logger'
import {
  makeRequestContext,
  useSqlIntegrationDatabase,
} from './helpers/sql-test-database'

const routeDatabase = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('@/lib/db', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/db')>()),
  getRequestSqlServerDataSource: routeDatabase.get,
}))
vi.mock('@/lib/auth/session', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/auth/session')>()),
  getSessionFromRequest: async () => ({
    accessTokenExpiresAt: Math.floor(Date.now() / 1000) + 3600,
    familyName: 'Actor',
    givenName: 'SQL',
    name: 'SQL Integration Actor',
    hsaId: 'SE5560000001-sqltest1',
    roles: ['Admin'],
    sub: 'sql-integration-actor',
  }),
}))

describe('Shared completed model verifications', () => {
  const database = useSqlIntegrationDatabase()
  beforeEach(() => {
    routeDatabase.get.mockImplementation(() => database())
    resetAuthConfigForTests()
    for (const [name, value] of Object.entries({
      AUTH_OIDC_CLIENT_ID: 'sql-integration-client',
      AUTH_OIDC_CLIENT_SECRET: 'sql-integration-client-secret',
      AUTH_OIDC_ISSUER_URL: 'https://idp.example.test',
      AUTH_OIDC_REDIRECT_URI: 'https://example.test/api/auth/callback',
      AUTH_OIDC_POST_LOGOUT_REDIRECT_URI: 'https://example.test/',
      AUTH_SESSION_COOKIE_PASSWORD:
        'sql-integration-session-secret-at-least-32-characters',
    }))
      vi.stubEnv(name, value)
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    resetAuthConfigForTests()
  })

  const parse = (value: unknown): { saveable: boolean } => {
    if (
      typeof value !== 'object' ||
      value === null ||
      !('saveable' in value) ||
      value.saveable !== true
    )
      throw new Error('invalid fixture')
    return { saveable: true }
  }
  async function createConnection(): Promise<string> {
    const db = database()
    const connection = await createSqlServerAiAdminStore(
      db,
      async () => {},
    ).createConnection({
      adapterKey: 'controlled_test',
      adapterVersion: '1',
      administrationName: 'SQL handover',
      agentRuntimeKey: null,
      agentRuntimeVersion: null,
      authenticationType: 'none',
      dataPolicySummary: 'Test',
      description: null,
      egressPolicyKey: 'sql_test',
      endpointUrl: 'https://ai.example.test/v1',
      maximumConcurrency: 2,
      publicName: 'SQL handover',
      tlsPolicyKey: 'public_web_pki',
    })
    return connection.id
  }

  it('survives replacement of its creating instance and is consumed once', async () => {
    const db = database()
    const first = createSqlServerAiModelVerificationAttemptStore(db, parse)
    const connectionId = await createConnection()
    const attempt = await first.create({
      connectionId,
      fingerprint: 'a'.repeat(64),
      result: { saveable: true },
    })
    const replacement = createSqlServerAiModelVerificationAttemptStore(
      db,
      parse,
    )
    expect(await replacement.list(connectionId)).toEqual([attempt])
    const input = {
      attemptId: attempt.id,
      connectionId,
      fingerprint: 'a'.repeat(64),
    }
    await db.transaction(async manager => {
      expect(await replacement.consume(input, manager)).toEqual(attempt)
    })
    await expect(
      db.transaction(manager => first.consume(input, manager)),
    ).rejects.toMatchObject({ code: 'attempt_unavailable' })
    expect(await replacement.list(connectionId)).toEqual([])
  })
  it('rolls consumption back with a failed save and admits an unexpired retry', async () => {
    const db = database()
    const store = createSqlServerAiModelVerificationAttemptStore(db, parse)
    const connectionId = await createConnection()
    const attempt = await store.create({
      connectionId,
      fingerprint: 'a'.repeat(64),
      result: { saveable: true },
    })
    const input = {
      connectionId,
      attemptId: attempt.id,
      fingerprint: 'a'.repeat(64),
    }
    await expect(
      db.transaction(async manager => {
        await store.consume(input, manager)
        throw new Error('save_failed')
      }),
    ).rejects.toThrow('save_failed')
    expect(await store.list(connectionId)).toEqual([attempt])
    await db.transaction(manager => store.consume(input, manager))
    expect(await store.list(connectionId)).toEqual([])
  })

  it('serializes concurrent saves and discard against the transaction owner', async () => {
    const db = database()
    const store = createSqlServerAiModelVerificationAttemptStore(db, parse)
    const connectionId = await createConnection()
    const attempt = await store.create({
      connectionId,
      fingerprint: 'a'.repeat(64),
      result: { saveable: true },
    })
    const input = {
      connectionId,
      attemptId: attempt.id,
      fingerprint: 'a'.repeat(64),
    }
    const owner = db.createQueryRunner()
    await owner.connect()
    await owner.startTransaction()
    try {
      await store.consume(input, owner.manager)
      await expect(
        db.transaction(manager => store.consume(input, manager)),
      ).rejects.toMatchObject({ code: 'attempt_unavailable' })
      await expect(store.discard(input)).rejects.toBeDefined()
      await owner.commitTransaction()
      await store.discard(input)
      await expect(
        db.transaction(manager => store.consume(input, manager)),
      ).rejects.toMatchObject({ code: 'attempt_unavailable' })
    } finally {
      if (owner.isTransactionActive) await owner.rollbackTransaction()
      await owner.release()
    }
    const discarded = await store.create({
      connectionId,
      fingerprint: 'a'.repeat(64),
      result: { saveable: true },
    })
    await store.discard({ connectionId, attemptId: discarded.id })
    await expect(
      db.transaction(manager =>
        store.consume({ ...input, attemptId: discarded.id }, manager),
      ),
    ).rejects.toMatchObject({ code: 'attempt_unavailable' })
  })

  it('rejects another connection or configuration without consuming accepted work', async () => {
    const db = database()
    const store = createSqlServerAiModelVerificationAttemptStore(db, parse)
    const connectionId = await createConnection()
    const attempt = await store.create({
      connectionId,
      fingerprint: 'a'.repeat(64),
      result: { saveable: true },
    })
    const input = {
      connectionId,
      attemptId: attempt.id,
      fingerprint: 'a'.repeat(64),
    }
    await store.discard({ ...input, connectionId: randomUUID() })
    await expect(
      db.transaction(manager =>
        store.consume({ ...input, connectionId: randomUUID() }, manager),
      ),
    ).rejects.toMatchObject({ code: 'attempt_unavailable' })
    await expect(
      db.transaction(manager =>
        store.consume({ ...input, fingerprint: 'b'.repeat(64) }, manager),
      ),
    ).rejects.toMatchObject({ code: 'attempt_mismatch' })
    expect(await store.list(connectionId)).toEqual([attempt])
  })

  it.each(['commit', 'rollback'] as const)(
    'protects an admitted save past expiry until %s',
    async outcome => {
      const db = database()
      const store = createSqlServerAiModelVerificationAttemptStore(db, parse)
      const connectionId = await createConnection()
      const attempt = await store.create({
        connectionId,
        fingerprint: 'a'.repeat(64),
        result: { saveable: true },
      })
      const input = {
        connectionId,
        attemptId: attempt.id,
        fingerprint: 'a'.repeat(64),
      }
      // A short SQL deadline gives a deterministic admission barrier without a 15-minute test.
      await db.query(
        `DECLARE @expiry datetime2 = DATEADD(second, 2, SYSUTCDATETIME());
      UPDATE ai_model_verification_attempts SET expires_at = @expiry,
        created_at = DATEADD(minute, -15, @expiry) WHERE id = @0`,
        [attempt.id],
      )
      const owner = db.createQueryRunner()
      await owner.connect()
      await owner.startTransaction()
      try {
        await store.consume(input, owner.manager)
        await db.query("WAITFOR DELAY '00:00:02.100'")
        expect(await purgeExpiredAiModelVerificationAttempts(db, 10)).toEqual({
          deletedRows: 0,
        })
        expect(
          await inspectExpiredAiModelVerificationAttempts(db),
        ).toMatchObject({ expiredRowCount: 0 })
        if (outcome === 'commit') await owner.commitTransaction()
        else await owner.rollbackTransaction()
        await expect(
          db.transaction(manager => store.consume(input, manager)),
        ).rejects.toMatchObject({
          code:
            outcome === 'commit' ? 'attempt_unavailable' : 'attempt_expired',
        })
        expect(await store.list(connectionId)).toEqual([])
        expect(await purgeExpiredAiModelVerificationAttempts(db, 10)).toEqual({
          deletedRows: outcome === 'commit' ? 0 : 1,
        })
      } finally {
        if (owner.isTransactionActive) await owner.rollbackTransaction()
        await owner.release()
      }
    },
  )

  it('bounds expiry cleanup and rejects admission at the SQL deadline', async () => {
    const db = database()
    const store = createSqlServerAiModelVerificationAttemptStore(db, parse)
    const connectionId = await createConnection()
    for (let index = 0; index < 3; index++) {
      const attempt = await store.create({
        connectionId,
        fingerprint: 'a'.repeat(64),
        result: { saveable: true },
      })
      await db.query(
        `DECLARE @now datetime2 = SYSUTCDATETIME(); UPDATE ai_model_verification_attempts
        SET created_at = DATEADD(minute, -15, @now), expires_at = @now WHERE id = @0`,
        [attempt.id],
      )
      await expect(
        db.transaction(manager =>
          store.consume(
            {
              connectionId,
              attemptId: attempt.id,
              fingerprint: 'a'.repeat(64),
            },
            manager,
          ),
        ),
      ).rejects.toMatchObject({ code: 'attempt_expired' })
    }
    const valid = await store.create({
      connectionId,
      fingerprint: 'a'.repeat(64),
      result: { saveable: true },
    })
    expect(await inspectExpiredAiModelVerificationAttempts(db)).toMatchObject({
      expiredRowCount: 3,
    })
    expect(await purgeExpiredAiModelVerificationAttempts(db, 2)).toEqual({
      deletedRows: 2,
    })
    expect(await inspectExpiredAiModelVerificationAttempts(db)).toMatchObject({
      expiredRowCount: 1,
    })
    expect(await store.list(connectionId)).toEqual([valid])
  })

  it('admits at most 512 shared attempts without eviction under concurrent creation', async () => {
    const db = database()
    const store = createSqlServerAiModelVerificationAttemptStore(db, parse)
    const connectionId = await createConnection()
    const original = await store.create({
      connectionId,
      fingerprint: 'a'.repeat(64),
      result: { saveable: true },
    })
    // Populate the capacity boundary efficiently; competing admissions use the public store.
    await db.query(
      `INSERT INTO ai_model_verification_attempts (id, ai_connection_id, fingerprint, payload_json, created_at, expires_at)
      SELECT TOP (510) NEWID(), ai_connection_id, fingerprint, payload_json, created_at, expires_at
      FROM ai_model_verification_attempts CROSS JOIN sys.all_objects WHERE id = @0`,
      [original.id],
    )
    const results = await Promise.allSettled(
      Array.from({ length: 4 }, () =>
        store.create({
          connectionId,
          fingerprint: 'a'.repeat(64),
          result: { saveable: true },
        }),
      ),
    )
    expect(
      results.filter(result => result.status === 'fulfilled'),
    ).toHaveLength(1)
    for (const result of results)
      if (result.status === 'rejected')
        expect(result.reason).toMatchObject({ code: 'attempt_capacity' })
    const pending = await store.list(connectionId)
    expect(pending).toHaveLength(512)
    expect(pending).toContainEqual(original)
  })

  it('hands a bounded candidate between administrators and rolls back attempts and revisions on audit failure', async () => {
    const db = database()
    const connectionId = await createConnection()
    const attempts = createSqlServerAiModelVerificationAttemptStore(
      db,
      parseAiModelVerificationPayload,
    )
    const external: AiAdminExternalOperations = {
      adapterAvailability: () => ({ available: true }),
      authorizeConnectionTarget: async () => true,
      authorizeRunProfile: async () => 'authorized',
      fetchCatalog: async () => [],
      probeHealth: async () => ({
        health: 'healthy',
        invalidationScope: 'none',
        failureCategory: null,
      }),
      verifyLivePath: async () => {
        throw new Error('unused')
      },
      verifyModelCandidate: async () => VERIFICATION,
      verifySecretCandidate: async () => {},
    }
    const creatorContext = await makeRequestContext()
    const creator = createAiConnectionAdministrationRuntime(
      db,
      creatorContext,
      { external },
    )
    const candidateInput = {
      connectionId,
      signal: new AbortController().signal,
      candidate: {
        name: '',
        description: 'Synthetic handover',
        externalModelId: 'controlled/handover',
        externalModelVersion: null,
        reasoning: VERIFICATION.reasoning,
      },
    }
    await db.query(`CREATE TRIGGER [fail_verification_audit] ON [action_audit_events]
      AFTER INSERT AS THROW 51000, 'verification_audit_failed', 1;`)
    try {
      const failure = await creator.verifyModelCandidate(candidateInput).then(
        () => undefined,
        error => error,
      )
      expect(failure).toMatchObject({ name: 'QueryFailedError' })
      expect(toHttpErrorPayload(failure)).toMatchObject({
        status: 500,
        body: {
          code: 'sql_failure',
          correlationId: expect.any(String),
          timestamp: expect.any(String),
        },
      })
      expect(await attempts.list(connectionId)).toEqual([])
    } finally {
      await db.query('DROP TRIGGER [fail_verification_audit]')
    }
    const result = await creator.verifyModelCandidate(candidateInput)
    if (!result.attemptId) throw new Error('Pending candidate missing')
    await db.query(`CREATE TRIGGER [fail_verification_audit] ON [action_audit_events]
      AFTER INSERT AS THROW 51000, 'verification_audit_failed', 1;`)
    try {
      const failure = await creator
        .discardModelVerification(connectionId, result.attemptId)
        .then(
          () => undefined,
          error => error,
        )
      expect(failure).toMatchObject({ name: 'QueryFailedError' })
      expect(toHttpErrorPayload(failure)).toMatchObject({
        status: 500,
        body: {
          code: 'sql_failure',
          correlationId: expect.any(String),
          timestamp: expect.any(String),
        },
      })
      expect(await attempts.list(connectionId)).toHaveLength(1)
    } finally {
      await db.query('DROP TRIGGER [fail_verification_audit]')
    }
    const secondContext = await makeRequestContext()
    secondContext.actor.hsaId = 'SE5560000001-second-admin'
    secondContext.actor.id = 'second-admin'
    const second = createAiConnectionAdministrationRuntime(db, secondContext, {
      external,
    })
    const detail = await second.getConnection(connectionId)
    const pending = detail.pendingVerifications?.[0]
    if (!pending || !result.attemptId)
      throw new Error('Pending candidate missing')
    expect(pending.result.candidate).toMatchObject({
      name: '',
      description: 'Synthetic handover',
      externalModelId: 'controlled/handover',
    })
    expect(pending.result.verification).toEqual(VERIFICATION)
    expect(detail.models).toEqual([])
    const modelRevision = {
      ...pending.result.candidate,
      name: 'Reviewed by another administrator',
      attemptId: pending.id,
    }
    await db.query(`CREATE TRIGGER [fail_verification_model_save] ON [ai_connection_models]
      AFTER INSERT AS THROW 51000, 'PRIVATE_MODEL_CANDIDATE', 1;`)
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const request = new Request(
        `https://example.test/api/admin/ai-connections/${connectionId}/actions`,
        {
          method: 'POST',
          headers: {
            Origin: 'https://example.test',
            'X-Requested-With': 'XMLHttpRequest',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            action: 'save_model_revision',
            modelRevision,
          }),
        },
      )
      attachVerifiedActor(request, secondContext.actor)
      const response = await modelConnectionAction(request, {
        params: Promise.resolve({ connectionId }),
      })
      expect(response.status).toBe(500)
      const body = await response.json()
      expect(body, JSON.stringify(log.mock.calls)).toMatchObject({
        code: 'sql_failure',
        correlationId: expect.any(String),
        timestamp: expect.any(String),
      })
      const occurrence = log.mock.calls
        .map(call => call[0])
        .find(value => typeof value === 'string' && value.startsWith('{'))
      expect(JSON.parse(String(occurrence))).toMatchObject({
        event: 'sql.operation.failed',
        correlation_id: body.correlationId,
        error: {
          message: 'Protected SQL operation failed',
          sql: { number: 51000 },
        },
      })
      expect(JSON.stringify(log.mock.calls)).not.toMatch(
        /PRIVATE_MODEL_CANDIDATE|INSERT INTO|candidate/iu,
      )
      expect((await second.getConnection(connectionId)).models).toEqual([])
      expect(await attempts.list(connectionId)).toHaveLength(1)
    } finally {
      log.mockRestore()
      await db.query('DROP TRIGGER [fail_verification_model_save]')
    }
    const failingStore = createSqlServerAiAdminStore(db, async () => {
      throw new Error('audit_failed')
    })
    await expect(
      failingStore.saveModelRevision({
        connection: detail,
        connectionId,
        modelRevision,
        verification: async manager =>
          (
            await attempts.consume(
              {
                connectionId,
                attemptId: pending.id,
                fingerprint: pending.fingerprint,
              },
              manager,
            )
          ).result.verification,
      }),
    ).rejects.toThrow('audit_failed')
    expect((await second.getConnection(connectionId)).models).toEqual([])
    expect(await attempts.list(connectionId)).toHaveLength(1)
    const saves = await Promise.allSettled([
      second.saveModelRevision({ connectionId, modelRevision }),
      creator.saveModelRevision({ connectionId, modelRevision }),
    ])
    expect(saves.filter(result => result.status === 'fulfilled')).toHaveLength(
      1,
    )
    const loser = saves.find(result => result.status === 'rejected')
    if (loser?.status !== 'rejected')
      throw new Error('Competing save did not fail')
    expect(loser.reason).toMatchObject({
      details: { blocker: 'attempt_unavailable' },
    })
    const winner = saves.find(result => result.status === 'fulfilled')
    if (winner?.status !== 'fulfilled')
      throw new Error('Neither save succeeded')
    const saved = winner.value
    expect(saved.name).toBe('Reviewed by another administrator')
    expect(saved.revisions).toHaveLength(1)
    await expect(
      second.saveModelRevision({ connectionId, modelRevision }),
    ).rejects.toMatchObject({ details: { blocker: 'attempt_unavailable' } })
    expect((await second.getConnection(connectionId)).models).toHaveLength(1)

    const update = await creator.verifyModelCandidate({
      connectionId,
      signal: new AbortController().signal,
      candidate: {
        ...pending.result.candidate,
        modelId: saved.id,
        modelToken: saved.revisionToken,
      },
    })
    if (!update.attemptId) throw new Error('Update verification missing')
    await db.query(
      'UPDATE ai_connection_models SET revision_token = NEWID() WHERE id = @0',
      [saved.id],
    )
    await expect(
      second.saveModelRevision({
        connectionId,
        modelRevision: {
          ...modelRevision,
          attemptId: update.attemptId,
          modelId: saved.id,
          modelToken: saved.revisionToken,
        },
      }),
    ).rejects.toMatchObject({ details: { blocker: 'attempt_mismatch' } })
    expect(await attempts.list(connectionId)).toHaveLength(1)
    expect(
      (await second.getConnection(connectionId)).models[0].revisions,
    ).toHaveLength(1)
  })

  it('keeps failed SQL insert parameters and database error text out of enabled logging', async () => {
    const db = database()
    const connectionId = await createConnection()
    const originalLogger = db.logger
    const output = [
      vi.spyOn(console, 'log'),
      vi.spyOn(console, 'warn'),
      vi.spyOn(console, 'error'),
    ]
    db.logger = new AiVerificationSqlLogger('all')
    try {
      const attempts = createSqlServerAiModelVerificationAttemptStore(
        db,
        parseAiModelVerificationPayload,
      )
      await expect(
        attempts.create({
          connectionId,
          fingerprint: 'a'.repeat(100),
          result: {
            candidate: {
              name: 'Private candidate sentinel',
              description: 'Private description sentinel',
              externalModelId: 'controlled/private',
              externalModelVersion: null,
              reasoning: VERIFICATION.reasoning,
              modelId: null,
              modelToken: null,
            },
            verification: VERIFICATION,
          },
        }),
      ).rejects.toMatchObject({ name: 'QueryFailedError' })
      const logs = JSON.stringify(output.flatMap(spy => spy.mock.calls))
      expect(logs).not.toMatch(
        /Private|candidate|description|truncated|INSERT INTO/iu,
      )
    } finally {
      db.logger = originalLogger
      for (const spy of output) spy.mockRestore()
    }
  })

  it.each(['parent kill', 'watchdog'] as const)(
    'allows retry only after SQL resolves a crashed process transaction (%s)',
    async termination => {
      const db = database()
      const store = createSqlServerAiModelVerificationAttemptStore(db, parse)
      const connectionId = await createConnection()
      const attempt = await store.create({
        connectionId,
        fingerprint: 'a'.repeat(64),
        result: { saveable: true },
      })
      const input = {
        connectionId,
        attemptId: attempt.id,
        fingerprint: 'a'.repeat(64),
      }
      const child = fork(
        new URL('./helpers/verification-crash-worker.mjs', import.meta.url),
        [],
        { stdio: ['ignore', 'ignore', 'ignore', 'ipc'], execArgv: [] },
      )
      try {
        const ready = once(child, 'message')
        child.send({
          options: {
            ...db.options,
            entities: [],
            migrations: [],
            subscribers: [],
          },
          attemptId: attempt.id,
        })
        expect((await ready)[0]).toBe('reserved')
        await expect(
          db.transaction(manager => store.consume(input, manager)),
        ).rejects.toMatchObject({ code: 'attempt_unavailable' })
        const exited = once(child, 'exit')
        if (termination === 'parent kill') child.kill('SIGKILL')
        else child.disconnect()
        expect(await exited).toEqual(
          termination === 'parent kill' ? [null, 'SIGKILL'] : [1, null],
        )
        await expect
          .poll(
            async () => {
              try {
                await db.transaction(manager => store.consume(input, manager))
                return 'consumed'
              } catch {
                return 'unavailable'
              }
            },
            { timeout: 5000 },
          )
          .toBe('consumed')
        expect(await store.list(connectionId)).toEqual([])
      } finally {
        if (child.exitCode === null && child.signalCode === null)
          child.kill('SIGKILL')
      }
    },
  )
  it('rejects serialized payload overflow before accepting any shared work', async () => {
    const db = database()
    const store = createSqlServerAiModelVerificationAttemptStore(
      db,
      parseAiModelVerificationPayload,
    )
    const connectionId = await createConnection()
    await expect(
      store.create({
        connectionId,
        fingerprint: 'a'.repeat(64),
        result: {
          candidate: {
            name: 'Bounded',
            description: '"'.repeat(20_000),
            externalModelId: 'controlled/bounded',
            externalModelVersion: null,
            reasoning: VERIFICATION.reasoning,
            modelId: null,
            modelToken: null,
          },
          verification: VERIFICATION,
        },
      }),
    ).rejects.toMatchObject({ code: 'attempt_payload_invalid' })
    expect(await store.list(connectionId)).toEqual([])
  })
})
