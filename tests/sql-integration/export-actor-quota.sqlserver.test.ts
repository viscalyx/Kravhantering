import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { resetAuthConfigForTests } from '@/lib/auth/config'
import {
  admitExportActor,
  releaseExportActor,
} from '@/lib/dal/export-actor-quota'
import type { SqlServerDatabase } from '@/lib/db'
import { runWithExportActorQuota } from '@/lib/generated-output/actor-quota'
import { runWithGeneratedOutputCapacity } from '@/lib/generated-output/capacity'
import { runBoundedStructuredOutput } from '@/lib/generated-output/structured-runner'
import { collectDataSubjectExport } from '@/lib/privacy/data-subject-export'
import {
  executePrivacyErasure,
  previewPrivacyErasure,
} from '@/lib/privacy/erasure'
import type { RequestContext } from '@/lib/requirements/auth'
import { requirementResponsibilityPersonTargetFingerprint } from '@/lib/requirements/responsibility-person-verification'
import { createExportActorQuotaCleanupTarget } from '@/lib/transient-cleanup/export-actor-quota-entries'
import { createAppDataSource } from '@/lib/typeorm/data-source'
import { privacyContext } from '@/tests/helpers/privacy-context'
import {
  resolveSqlIntegrationTestsUrl,
  useSqlIntegrationDatabase,
} from './helpers/sql-test-database'

const fingerprint = (actor: number) => `hfp_${String(actor).padStart(22, '0')}`
describe('Export and report actor quota in SQL Server', () => {
  const db = useSqlIntegrationDatabase()
  let replica: SqlServerDatabase
  beforeEach(() => {
    resetAuthConfigForTests()
    vi.stubEnv('AUTH_OIDC_CLIENT_ID', 'sql-integration-client')
    vi.stubEnv('AUTH_OIDC_CLIENT_SECRET', 'sql-integration-client-secret')
    vi.stubEnv('AUTH_OIDC_ISSUER_URL', 'https://idp.example.test')
    vi.stubEnv('AUTH_OIDC_POST_LOGOUT_REDIRECT_URI', 'https://example.test/')
    vi.stubEnv(
      'AUTH_OIDC_REDIRECT_URI',
      'https://example.test/api/auth/callback',
    )
    vi.stubEnv(
      'AUTH_SESSION_COOKIE_PASSWORD',
      'sql-integration-cookie-password-at-least-32-characters',
    )
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    resetAuthConfigForTests()
  })
  beforeAll(async () => {
    replica = createAppDataSource({ url: resolveSqlIntegrationTestsUrl() })
    await replica.initialize()
  })
  afterAll(async () => {
    await replica?.destroy()
  })

  it('admits ten rolling starts across replicas and keeps rejected starts free', async () => {
    for (let i = 0; i < 10; i++) {
      const client = i % 2 ? replica : db()
      const admission = await admitExportActor(client, fingerprint(1))
      expect(admission.allowed).toBe(true)
      if (admission.allowed) await releaseExportActor(client, admission.id)
    }
    await expect(
      admitExportActor(replica, fingerprint(1)),
    ).resolves.toMatchObject({ allowed: false, reason: 'actor_rate_limit' })
    await expect(admitExportActor(db(), fingerprint(2))).resolves.toMatchObject(
      { allowed: true },
    )
  })
  it('serializes concurrent starts and preserves an independent actor behind the same proxy', async () => {
    const attempts = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        admitExportActor(i % 2 ? db() : replica, fingerprint(3)),
      ),
    )
    const admitted = attempts.filter(result => result.allowed)
    expect(admitted).toHaveLength(1)
    expect(attempts.filter(result => !result.allowed)).toHaveLength(19)
    await expect(
      admitExportActor(replica, fingerprint(4)),
    ).resolves.toMatchObject({ allowed: true })
    if (admitted[0]?.allowed) await releaseExportActor(db(), admitted[0].id)
    for (let i = 0; i < 9; i++) {
      const next = await admitExportActor(replica, fingerprint(3))
      expect(next.allowed).toBe(true)
      if (next.allowed) await releaseExportActor(db(), next.id)
    }
    await expect(admitExportActor(db(), fingerprint(3))).resolves.toMatchObject(
      { allowed: false, reason: 'actor_rate_limit' },
    )
  })

  it('expires starts at the rolling boundary and applies tuning without resetting usage', async () => {
    const start = await admitExportActor(db(), fingerprint(5))
    if (!start.allowed) throw new Error('Expected admission')
    await releaseExportActor(db(), start.id)
    await db().query(
      'UPDATE application_settings SET export_actor_starts_per_minute = 1 WHERE id = 1',
    )
    try {
      await expect(
        admitExportActor(replica, fingerprint(5)),
      ).resolves.toMatchObject({
        allowed: false,
        reason: 'actor_rate_limit',
        retryAfterSeconds: expect.any(Number),
      })
      await db().query(
        'UPDATE export_actor_quota_entries SET created_at = DATEADD(second, -60, SYSUTCDATETIME()) WHERE id = @0',
        [start.id],
      )
      await expect(
        admitExportActor(replica, fingerprint(5)),
      ).resolves.toMatchObject({ allowed: true })
    } finally {
      await db().query(
        'UPDATE application_settings SET export_actor_starts_per_minute = 10 WHERE id = 1',
      )
    }
  })

  it('recovers expired node admissions without letting a late release free newer work', async () => {
    const old = await admitExportActor(db(), fingerprint(6))
    if (!old.allowed) throw new Error('Expected admission')
    await db().query(
      `UPDATE export_actor_quota_entries SET created_at = DATEADD(second, -901, SYSUTCDATETIME()), expires_at = DATEADD(second, -1, SYSUTCDATETIME()) WHERE id = @0`,
      [old.id],
    )
    const newer = await admitExportActor(replica, fingerprint(6))
    expect(newer.allowed).toBe(true)
    await Promise.all([
      releaseExportActor(db(), old.id),
      releaseExportActor(replica, old.id),
    ])
    await expect(admitExportActor(db(), fingerprint(6))).resolves.toMatchObject(
      { allowed: false, reason: 'actor_concurrency_limit' },
    )
  })

  it('changing active limits neither cancels work nor bypasses recorded usage', async () => {
    const first = await admitExportActor(db(), fingerprint(7))
    expect(first.allowed).toBe(true)
    await db().query(
      'UPDATE application_settings SET export_actor_concurrency = 2 WHERE id = 1',
    )
    try {
      const second = await admitExportActor(replica, fingerprint(7))
      expect(second.allowed).toBe(true)
      await db().query(
        'UPDATE application_settings SET export_actor_concurrency = 1 WHERE id = 1',
      )
      if (second.allowed) await releaseExportActor(replica, second.id)
      await expect(
        admitExportActor(db(), fingerprint(7)),
      ).resolves.toMatchObject({
        allowed: false,
        reason: 'actor_concurrency_limit',
      })
      if (first.allowed) await releaseExportActor(db(), first.id)
      await expect(
        admitExportActor(replica, fingerprint(7)),
      ).resolves.toMatchObject({ allowed: true })
    } finally {
      await db().query(
        'UPDATE application_settings SET export_actor_concurrency = 1 WHERE id = 1',
      )
    }
  })
  it('exports and erases exact person state without releasing live work or another actor', async () => {
    const hsaId = 'SE5560000001-exportperson'
    const actorFingerprint =
      requirementResponsibilityPersonTargetFingerprint(hsaId)
    const first = await admitExportActor(db(), actorFingerprint)
    const other = await admitExportActor(replica, fingerprint(20))
    if (!first.allowed || !other.allowed) throw new Error('Expected admissions')
    const payload = await collectDataSubjectExport(
      db(),
      {
        generatedBy: {
          displayName: 'Officer',
          hsaId: 'SE5560000001-officer',
          source: 'oidc',
        },
        target: { hsaId },
      },
      {
        maxItems: 1000,
        signal: new AbortController().signal,
        createItemLimitError: () => new Error('too many'),
      },
    )
    expect(JSON.stringify(payload)).toContain(
      'export_actor_quota_entries.subject',
    )
    expect(JSON.stringify(payload)).not.toContain(actorFingerprint)
    expect(JSON.stringify(payload)).not.toContain(first.id)
    const preview = await previewPrivacyErasure(db(), { target: { hsaId } })
    expect(preview.groups).toContainEqual(
      expect.objectContaining({
        key: 'export_actor_quota_entries.subject',
        count: 1,
      }),
    )
    await expect(
      executePrivacyErasure(db(), {
        context: privacyContext(),
        target: { hsaId },
        previewToken: preview.previewToken,
      }),
    ).rejects.toMatchObject({
      details: { reason: 'active_export_actor_quota' },
    })
    await releaseExportActor(replica, first.id)
    const refreshed = await previewPrivacyErasure(db(), { target: { hsaId } })
    await executePrivacyErasure(db(), {
      context: privacyContext(),
      target: { hsaId },
      previewToken: refreshed.previewToken,
    })
    const after = await previewPrivacyErasure(db(), { target: { hsaId } })
    expect(after.groups).not.toContainEqual(
      expect.objectContaining({ key: 'export_actor_quota_entries.subject' }),
    )
    await expect(
      admitExportActor(db(), fingerprint(20)),
    ).resolves.toMatchObject({
      allowed: false,
      reason: 'actor_concurrency_limit',
    })
  })

  it('runs bounded cleanup concurrently with release without touching active or recent usage', async () => {
    const expired = await admitExportActor(db(), fingerprint(30))
    const current = await admitExportActor(db(), fingerprint(31))
    if (!expired.allowed || !current.allowed)
      throw new Error('Expected admissions')
    await db().query(
      `UPDATE export_actor_quota_entries SET created_at = DATEADD(second, -901, SYSUTCDATETIME()), expires_at = DATEADD(second, -1, SYSUTCDATETIME()) WHERE id = @0`,
      [expired.id],
    )
    const cleanup = createExportActorQuotaCleanupTarget(replica)
    expect(await cleanup.inspect()).toMatchObject({ expiredRowCount: 1 })
    await Promise.all([
      cleanup.purgeBatch(1),
      releaseExportActor(db(), expired.id),
    ])
    expect(await cleanup.inspect()).toMatchObject({ expiredRowCount: 0 })
    await expect(
      admitExportActor(db(), fingerprint(31)),
    ).resolves.toMatchObject({
      allowed: false,
      reason: 'actor_concurrency_limit',
    })
  })
  it('lets another person finish while one actor holds a slot across formats and app contexts', async () => {
    const context = (hsaId: string): RequestContext => ({
      actor: {
        hsaId,
        displayName: 'Same display name',
        id: hsaId,
        isAuthenticated: true,
        source: 'oidc',
        roles: ['Admin'],
      },
      correlationId: 'same-proxy',
      requestId: 'same-proxy',
      source: 'rest',
    })
    const actorA = context('SE5560000001-actor1')
    const actorB = context('SE5560000001-actor2')
    let finish!: () => void
    let markStarted!: () => void
    const started = new Promise<void>(resolve => {
      markStarted = resolve
    })
    const first = runWithExportActorQuota(db(), actorA, 'csv', undefined, () =>
      runWithGeneratedOutputCapacity(
        { output: 'csv', concurrencyLimit: 2 },
        () =>
          new Promise<Response>(resolve => {
            finish = () => resolve(new Response('actor A'))
            markStarted()
          }),
      ),
    )
    await Promise.race([started, first])
    try {
      await expect(
        runWithExportActorQuota(
          replica,
          actorA,
          'pdf',
          undefined,
          async () => new Response('must not start'),
        ),
      ).rejects.toMatchObject({ code: 'actor_concurrency_limit', status: 429 })
      const other = await runWithExportActorQuota(
        replica,
        actorB,
        'json',
        undefined,
        () =>
          runWithGeneratedOutputCapacity(
            { output: 'json', concurrencyLimit: 2 },
            async () => new Response('actor B'),
          ),
      )
      expect(await other.text()).toBe('actor B')
    } finally {
      finish()
      expect(await (await first).text()).toBe('actor A')
    }
  })

  it('bounds archive collection in SQL without changing connection session settings', async () => {
    const context = {
      actor: {
        isAuthenticated: true,
        hsaId: 'SE5560000001-archive',
        roles: ['Admin'],
      },
      correlationId: 'archive',
      requestId: 'archive',
      source: 'rest',
    } as RequestContext
    await db().query(
      'UPDATE application_settings SET csv_export_max_items = 2 WHERE id = 1',
    )
    try {
      await expect(
        runBoundedStructuredOutput({
          db: db(),
          context,
          output: 'json',
          collect: ({ query }) =>
            query(
              'SELECT sample.value FROM (VALUES (1), (2), (3)) AS sample(value)',
            ),
        }),
      ).rejects.toMatchObject({
        code: 'output_limit_exceeded',
        details: { limitKind: 'items', limit: 2 },
      })
      const valid = await runBoundedStructuredOutput({
        db: db(),
        context,
        output: 'json',
        collect: ({ query }) =>
          query(
            'SELECT TOP (1) sample.value FROM (VALUES (1), (2), (3)) AS sample(value) ORDER BY sample.value',
          ),
      })
      expect(await valid.json()).toEqual([{ value: 1 }])
    } finally {
      await db().query(
        'UPDATE application_settings SET csv_export_max_items = 1000 WHERE id = 1',
      )
    }
  })
})
