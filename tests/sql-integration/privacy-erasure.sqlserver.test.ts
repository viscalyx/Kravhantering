import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { recordAllowedActionAuditEventWithExecutor } from '@/lib/audit/action-audit'
import { resetAuthConfigForTests } from '@/lib/auth/config'
import type { SqlServerDatabase } from '@/lib/db'
import { mcpImportValidationPrincipalFingerprint } from '@/lib/mcp/import-validation-principal'
import {
  executePrivacyErasure,
  previewPrivacyErasure,
} from '@/lib/privacy/erasure'
import { privacyContext } from '@/tests/helpers/privacy-context'
import {
  createArea,
  createPublishedRequirement,
  createSpecificationFixture,
  ensureResponsibilityPerson,
  useSqlIntegrationDatabase,
} from './helpers/sql-test-database'

const target = { hsaId: 'SE5560000001-erasure1' }
const replacement = {
  hsaId: 'SE5560000001-erasure2',
  displayName: 'Replacement',
  email: 'person@example.test',
}

async function rateBucket(db: SqlServerDatabase) {
  await db.query(
    `INSERT INTO requirement_import_validation_rate_buckets
    (principal_fingerprint, window_started_at, successful_creations, expires_at, created_at, updated_at)
    VALUES (@0, '20260101', 1, '20260102', '20260101', '20260101')`,
    [mcpImportValidationPrincipalFingerprint(target.hsaId)],
  )
}

async function historyFixture(db: SqlServerDatabase) {
  const area = await createArea(db, { ownerHsaId: target.hsaId })
  const requirement = await createPublishedRequirement(
    db,
    area.id,
    'Required business history',
  )
  await db.query(
    'UPDATE requirement_versions SET created_by_hsa_id = @0, created_by = @1 WHERE id = @2',
    [target.hsaId, 'Reviewed name', requirement.publishedVersionId],
  )
  await rateBucket(db)
  return { area, requirement }
}

function audit(
  executor: Parameters<typeof recordAllowedActionAuditEventWithExecutor>[0],
) {
  return recordAllowedActionAuditEventWithExecutor(executor, privacyContext(), {
    action: 'privacy.erasure.execute',
    targetId: 'privacy-test',
    targetKind: 'PrivacyErasure',
  })
}

describe('Reviewed personal data erasure through SQL Server', () => {
  const appDb = useSqlIntegrationDatabase()
  beforeEach(() => {
    resetAuthConfigForTests()
    for (const [key, value] of Object.entries({
      AUTH_OIDC_CLIENT_ID: 'sql-integration-client',
      AUTH_OIDC_CLIENT_SECRET: 'sql-integration-client-secret',
      AUTH_OIDC_ISSUER_URL: 'https://idp.example.test',
      AUTH_OIDC_POST_LOGOUT_REDIRECT_URI: 'https://example.test/',
      AUTH_OIDC_REDIRECT_URI: 'https://example.test/api/auth/callback',
      AUTH_SESSION_COOKIE_PASSWORD:
        'sql-integration-session-secret-at-least-32-characters',
    }))
      vi.stubEnv(key, value)
  })
  afterEach(async () => {
    vi.restoreAllMocks()
    await appDb().query('DROP TRIGGER IF EXISTS fail_privacy_audit')
    await appDb().query('DROP TRIGGER IF EXISTS fail_privacy_delete')
    vi.unstubAllEnvs()
    resetAuthConfigForTests()
  })

  it.each(['area', 'specification'] as const)(
    'reviews and erases a %s co-author assignment',
    async kind => {
      const db = appDb()
      await ensureResponsibilityPerson(db, target.hsaId)
      const parent =
        kind === 'area'
          ? await createArea(db)
          : await createSpecificationFixture(db, 'PRIV')
      const table =
        kind === 'area'
          ? 'requirement_area_co_authors'
          : 'specification_co_authors'
      const parentKey = kind === 'area' ? 'area_id' : 'specification_id'
      await db.query(
        `INSERT INTO ${table} (${parentKey}, hsa_id, created_at) VALUES (@0, @1, SYSUTCDATETIME())`,
        [parent.id, target.hsaId],
      )
      const preview = await previewPrivacyErasure(db, { target })
      await executePrivacyErasure(db, {
        context: privacyContext(),
        target,
        previewToken: preview.previewToken,
      })
      expect(
        await db.query(`SELECT hsa_id FROM ${table} WHERE ${parentKey} = @0`, [
          parent.id,
        ]),
      ).toEqual([])
    },
  )

  it.each(['addition', 'content edit'] as const)(
    'requires a new preview for dependent forensic evidence %s without exposing evidence',
    async change => {
      const db = appDb()
      const [capture] = await db.query(
        `INSERT INTO ai_forensic_capture_windows
      (operation, direction, requested_by_hsa_id, requested_by_display_name, requested_at,
       expires_at, is_open, event_byte_limit, event_item_limit, collection_item_limit)
      OUTPUT INSERTED.id VALUES (N'ai.generate-requirement-import', N'input', @0, N'Requester',
       '20260101', '2026-01-01T00:10:00', NULL, 8192, 8, 1000)`,
        [target.hsaId],
      )
      const insertEvidence = () =>
        db.query(
          `INSERT INTO ai_forensic_evidence_events
      (ai_forensic_capture_window_id, event_id, blocked_step, rule_ids_json, evidence_json, item_count, byte_count, captured_at)
      VALUES (@0, NEWID(), N'input', N'[]', @1, 1, DATALENGTH(@1), '20260101')`,
          [capture.id, '["private excerpt"]'],
        )
      await insertEvidence()
      const preview = await previewPrivacyErasure(db, { target })
      expect(JSON.stringify(preview)).not.toContain('private excerpt')
      if (change === 'addition') await insertEvidence()
      else
        await db.query(
          'UPDATE ai_forensic_evidence_events SET evidence_json = @0, byte_count = DATALENGTH(@0)',
          ['["changed excerpt"]'],
        )
      expect((await previewPrivacyErasure(db, { target })).groups).toEqual(
        preview.groups,
      )
      await expect(
        executePrivacyErasure(db, {
          context: privacyContext(),
          target,
          previewToken: preview.previewToken,
        }),
      ).rejects.toMatchObject({ details: { reason: 'stale_privacy_preview' } })
      const fresh = await previewPrivacyErasure(db, { target })
      const result = await executePrivacyErasure(db, {
        context: privacyContext(),
        target,
        previewToken: fresh.previewToken,
      })
      expect(result.actions.anonymize).toBe(1)
      expect(
        await db.query('SELECT id FROM ai_forensic_evidence_events'),
      ).toEqual([])
      expect(
        await db.query(
          'SELECT requested_by_hsa_id, requested_by_display_name FROM ai_forensic_capture_windows',
        ),
      ).toEqual([
        { requested_by_hsa_id: null, requested_by_display_name: 'no-user' },
      ])
    },
  )

  it.each(['substitution', 'counter change'] as const)(
    'rejects a technical fingerprint %s with the same count and no labels',
    async change => {
      const db = appDb()
      await rateBucket(db)
      const preview = await previewPrivacyErasure(db, { target })
      if (change === 'substitution') {
        await db.query('DELETE FROM requirement_import_validation_rate_buckets')
        await rateBucket(db)
      } else {
        await db.query(
          'UPDATE requirement_import_validation_rate_buckets SET successful_creations = 2',
        )
      }
      expect((await previewPrivacyErasure(db, { target })).groups).toEqual(
        preview.groups,
      )
      await expect(
        executePrivacyErasure(db, {
          context: privacyContext(),
          target,
          previewToken: preview.previewToken,
        }),
      ).rejects.toMatchObject({ details: { reason: 'stale_privacy_preview' } })
      expect(
        await db.query(
          'SELECT COUNT(*) AS count FROM requirement_import_validation_rate_buckets',
        ),
      ).toEqual([{ count: 1 }])
    },
  )

  it('rejects a changed display value beyond the first occurrence', async () => {
    const db = appDb()
    const { area } = await historyFixture(db)
    const second = await createPublishedRequirement(
      db,
      area.id,
      'Second preserved history',
    )
    await db.query(
      'UPDATE requirement_versions SET created_by_hsa_id = @0, created_by = @1 WHERE id = @2',
      [target.hsaId, 'Second reviewed name', second.publishedVersionId],
    )
    const preview = await previewPrivacyErasure(db, { target })
    await db.query(
      'UPDATE requirement_versions SET created_by = @0 WHERE id = @1',
      ['Changed second name', second.publishedVersionId],
    )
    expect((await previewPrivacyErasure(db, { target })).groups).toEqual(
      preview.groups,
    )
    await expect(
      executePrivacyErasure(db, {
        context: privacyContext(),
        target,
        previewToken: preview.previewToken,
      }),
    ).rejects.toMatchObject({ details: { reason: 'stale_privacy_preview' } })
    expect(
      await db.query(
        'SELECT created_by FROM requirement_versions WHERE id = @0',
        [second.publishedVersionId],
      ),
    ).toEqual([{ created_by: 'Changed second name' }])
  })

  it('executes unchanged delete, anonymize, skip and switch choices and preserves business history', async () => {
    const db = appDb()
    const { area, requirement } = await historyFixture(db)
    const preview = await previewPrivacyErasure(db, { target, replacement })
    const result = await executePrivacyErasure(db, {
      context: privacyContext(),
      target,
      replacement,
      previewToken: preview.previewToken,
      audit,
    })
    expect(result.actions).toEqual({
      anonymize: 1,
      delete: 1,
      skip: 1,
      switch: 1,
    })
    expect(
      await db.query(
        'SELECT owner_hsa_id FROM requirement_areas WHERE id = @0',
        [area.id],
      ),
    ).toEqual([{ owner_hsa_id: replacement.hsaId }])
    expect(
      await db.query(
        'SELECT created_by_hsa_id, created_by, description FROM requirement_versions WHERE id = @0',
        [requirement.publishedVersionId],
      ),
    ).toEqual([
      {
        created_by_hsa_id: null,
        created_by: 'no-user',
        description: 'Required business history',
      },
    ])
    expect(
      await db.query(
        'SELECT id FROM requirement_import_validation_rate_buckets',
      ),
    ).toEqual([])
    expect(await db.query('SELECT action FROM action_audit_events')).toEqual([
      { action: 'privacy.erasure.execute' },
    ])
  })

  it.each(['displayName', 'email', 'firstName', 'lastName', 'hsaId'] as const)(
    'rejects changed replacement %s without changing stored data',
    async field => {
      const db = appDb()
      const { area } = await historyFixture(db)
      const preview = await previewPrivacyErasure(db, { target, replacement })
      const changed = {
        ...replacement,
        [field]: field === 'hsaId' ? 'SE5560000001-erasure3' : 'Changed',
      }
      await expect(
        executePrivacyErasure(db, {
          context: privacyContext(),
          target,
          replacement: changed,
          previewToken: preview.previewToken,
        }),
      ).rejects.toMatchObject({ details: { reason: 'stale_privacy_preview' } })
      expect(
        await db.query(
          'SELECT owner_hsa_id FROM requirement_areas WHERE id = @0',
          [area.id],
        ),
      ).toEqual([{ owner_hsa_id: target.hsaId }])
    },
  )

  it('rejects changed stored replacement details before overwriting them', async () => {
    const db = appDb()
    await historyFixture(db)
    await ensureResponsibilityPerson(db, replacement.hsaId)
    const preview = await previewPrivacyErasure(db, { target, replacement })
    await db.query(
      'UPDATE requirement_responsibility_people SET email = @0 WHERE hsa_id = @1',
      ['changed@example.test', replacement.hsaId],
    )
    await expect(
      executePrivacyErasure(db, {
        context: privacyContext(),
        target,
        replacement,
        previewToken: preview.previewToken,
      }),
    ).rejects.toMatchObject({ details: { reason: 'stale_privacy_preview' } })
    expect(
      await db.query(
        'SELECT email FROM requirement_responsibility_people WHERE hsa_id = @0',
        [replacement.hsaId],
      ),
    ).toEqual([{ email: 'changed@example.test' }])
  })

  it.each(['later deletion', 'required audit'] as const)(
    'rolls back the complete request after a %s failure',
    async failure => {
      const db = appDb()
      const { area, requirement } = await historyFixture(db)
      const preview = await previewPrivacyErasure(db, { target, replacement })
      await db.query(
        failure === 'required audit'
          ? `CREATE TRIGGER fail_privacy_audit ON action_audit_events AFTER INSERT AS
         BEGIN SET NOCOUNT ON; THROW 51000, 'Injected privacy audit failure', 1; END`
          : `CREATE TRIGGER fail_privacy_delete ON requirement_import_validation_rate_buckets AFTER DELETE AS
         BEGIN SET NOCOUNT ON; THROW 51000, 'Injected privacy delete failure', 1; END`,
      )
      await expect(
        executePrivacyErasure(db, {
          context: privacyContext(),
          target,
          replacement,
          previewToken: preview.previewToken,
          audit,
        }),
      ).rejects.toThrow(/Injected privacy/)
      expect(
        await db.query(
          'SELECT owner_hsa_id FROM requirement_areas WHERE id = @0',
          [area.id],
        ),
      ).toEqual([{ owner_hsa_id: target.hsaId }])
      expect(
        await db.query(
          'SELECT created_by_hsa_id, created_by FROM requirement_versions WHERE id = @0',
          [requirement.publishedVersionId],
        ),
      ).toEqual([
        { created_by_hsa_id: target.hsaId, created_by: 'Reviewed name' },
      ])
      expect(
        await db.query(
          'SELECT COUNT(*) AS count FROM requirement_import_validation_rate_buckets',
        ),
      ).toEqual([{ count: 1 }])
      expect(
        await db.query(
          'SELECT hsa_id FROM requirement_responsibility_people WHERE hsa_id = @0',
          [replacement.hsaId],
        ),
      ).toEqual([])
      expect(await db.query('SELECT id FROM action_audit_events')).toEqual([])
    },
  )

  it('rechecks authorization and rejects unavailable proof inside execution', async () => {
    const db = appDb()
    await rateBucket(db)
    const preview = await previewPrivacyErasure(db, { target })
    const context = privacyContext()
    context.actor.roles = []
    await expect(
      executePrivacyErasure(db, {
        context,
        target,
        previewToken: preview.previewToken,
      }),
    ).rejects.toMatchObject({ status: 403 })
    await expect(
      executePrivacyErasure(db, {
        context: privacyContext(),
        target,
        previewToken: 'unavailable',
      }),
    ).rejects.toMatchObject({ details: { reason: 'stale_privacy_preview' } })
    expect(
      await db.query(
        'SELECT COUNT(*) AS count FROM requirement_import_validation_rate_buckets',
      ),
    ).toEqual([{ count: 1 }])
  })

  it.each(['preview collection', 'execution'] as const)(
    'protects reviewed values against a competing writer during %s',
    async stage => {
      const db = appDb()
      const { requirement } = await historyFixture(db)
      const preview = await previewPrivacyErasure(db, { target, replacement })
      let observedBlockedWriter = false
      const createRunner = db.createQueryRunner.bind(db)
      vi.spyOn(db, 'createQueryRunner').mockImplementation(mode => {
        const runner = createRunner(mode)
        const query = runner.query.bind(runner)
        vi.spyOn(runner, 'query').mockImplementation(async (...args) => {
          const boundary =
            stage === 'execution'
              ? args[0].includes('UPDATE requirement_areas')
              : args[0].includes('FROM deviations WHERE created_by_hsa_id')
          if (boundary && !observedBlockedWriter) {
            observedBlockedWriter = true
            await expect(
              db.query(
                `SET LOCK_TIMEOUT 250;
                BEGIN TRY
                  UPDATE requirement_versions SET created_by = @0 WHERE id = @1;
                  SET LOCK_TIMEOUT -1;
                END TRY
                BEGIN CATCH
                  SET LOCK_TIMEOUT -1;
                  THROW;
                END CATCH`,
                ['Competing name', requirement.publishedVersionId],
              ),
            ).rejects.toMatchObject({ driverError: { number: 1222 } })
          }
          return query(...args)
        })
        return runner
      })
      if (stage === 'preview collection') {
        expect(
          (await previewPrivacyErasure(db, { target, replacement }))
            .previewToken,
        ).toBe(preview.previewToken)
      } else {
        await executePrivacyErasure(db, {
          context: privacyContext(),
          target,
          replacement,
          previewToken: preview.previewToken,
        })
        expect(
          await db.query(
            'SELECT created_by FROM requirement_versions WHERE id = @0',
            [requirement.publishedVersionId],
          ),
        ).toEqual([{ created_by: 'no-user' }])
      }
      expect(observedBlockedWriter).toBe(true)
      vi.restoreAllMocks()
      await db.query(
        'UPDATE requirement_versions SET created_by = @0 WHERE id = @1',
        ['Later activity', requirement.publishedVersionId],
      )
      expect(
        await db.query(
          'SELECT created_by FROM requirement_versions WHERE id = @0',
          [requirement.publishedVersionId],
        ),
      ).toEqual([{ created_by: 'Later activity' }])
    },
  )

  it('rejects a package co-author substitution with the same count and label', async () => {
    const db = appDb()
    await ensureResponsibilityPerson(db, target.hsaId)
    const packages = await db.query(
      `INSERT INTO requirement_packages
      (name, purpose_and_scope, lead_hsa_id, created_at, updated_at) OUTPUT INSERTED.id
      VALUES (N'Same label', N'Privacy test', @0, SYSUTCDATETIME(), SYSUTCDATETIME()),
             (N'Same label', N'Privacy test', @0, SYSUTCDATETIME(), SYSUTCDATETIME())`,
      [target.hsaId],
    )
    await db.query(
      `INSERT INTO requirement_package_co_authors
      (requirement_package_id, hsa_id, created_at) VALUES (@0, @1, SYSUTCDATETIME())`,
      [packages[0].id, target.hsaId],
    )
    const reviewed = await previewPrivacyErasure(db, { target })
    await db.query(
      'UPDATE requirement_package_co_authors SET requirement_package_id = @0 WHERE hsa_id = @1',
      [packages[1].id, target.hsaId],
    )
    const current = await previewPrivacyErasure(db, { target })
    expect(current.groups).toEqual(reviewed.groups)
    await expect(
      executePrivacyErasure(db, {
        context: privacyContext(),
        target,
        previewToken: reviewed.previewToken,
      }),
    ).rejects.toMatchObject({ details: { reason: 'stale_privacy_preview' } })
    expect(
      await db.query(
        'SELECT requirement_package_id FROM requirement_package_co_authors WHERE hsa_id = @0',
        [target.hsaId],
      ),
    ).toEqual([{ requirement_package_id: packages[1].id }])
  })
})
