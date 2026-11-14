import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  executeArchivingRetention,
  exportArchivingRetentionArchive,
  previewArchivingRetention,
} from '@/lib/archiving/retention'
import { recordAllowedActionAuditEventWithExecutor } from '@/lib/audit/action-audit'
import { resetAuthConfigForTests } from '@/lib/auth/config'
import type { SqlServerDatabase } from '@/lib/db'
import { runBoundedStructuredOutput } from '@/lib/generated-output/structured-runner'
import {
  createArea,
  createPublishedRequirement,
  createSpecificationFixture,
  makeRequestContext,
  useSqlIntegrationDatabase,
} from './helpers/sql-test-database'

const actor = { displayName: 'SQL Privacy Officer', hsaId: null }

async function policy(
  db: SqlServerDatabase,
  key = 'obsolete_specifications_delete',
): Promise<number> {
  const rows = await db.query(
    `INSERT INTO archiving_retention_policies
    (policy_key, information_set, action, age_days, status_condition, is_enabled, created_at, updated_at)
    OUTPUT INSERTED.id AS id VALUES (@0, N'SQL retention', N'delete', 365, N'Old unused data', 1, '20000101', '20000101')`,
    [key],
  )
  return rows[0].id
}

async function specification(
  db: SqlServerDatabase,
  code = 'ARC1',
): Promise<number> {
  const { id } = await createSpecificationFixture(db, code)
  await db.query(
    `UPDATE requirements_specifications SET updated_at = '20000101',
    specification_lifecycle_status_id = 1 WHERE id = @0`,
    [id],
  )
  await db.query(
    `INSERT INTO specification_needs_references
    (specification_id, text, description, created_at, updated_at)
    VALUES (@0, N'Original need', N'Original description', '20000101', '20000101')`,
    [id],
  )
  return id
}

async function exportInput(db: SqlServerDatabase, policyId: number) {
  const preview = await previewArchivingRetention(db, { policyId })
  const exported = await exportArchivingRetentionArchive(db, {
    policyId,
    previewToken: preview.previewToken,
  })
  return {
    policyId,
    previewToken: preview.previewToken,
    exportToken: exported.exportToken,
  }
}

// Observe the real driver at a chosen SQL boundary; every query still reaches SQL Server.
function intercept(
  db: SqlServerDatabase,
  before: (sql: string, parameters?: unknown[]) => Promise<void>,
) {
  const createRunner = db.createQueryRunner.bind(db)
  vi.spyOn(db, 'createQueryRunner').mockImplementation(mode => {
    const runner = createRunner(mode)
    const query = runner.query.bind(runner)
    vi.spyOn(runner, 'query').mockImplementation(async (...args) => {
      await before(args[0], Array.isArray(args[1]) ? args[1] : undefined)
      return query(...args)
    })
    return runner
  })
}

describe('Archive preservation and atomic disposal through SQL Server', () => {
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
    await appDb().query('DROP TRIGGER IF EXISTS fail_retention_audit')
    await appDb().query('DROP TRIGGER IF EXISTS fail_retention_delete')
    vi.unstubAllEnvs()
    resetAuthConfigForTests()
  })

  it('exports unchanged content and counts each disposed specification once including its children', async () => {
    const db = appDb()
    const policyId = await policy(db)
    await specification(db)
    const context = await makeRequestContext()
    const preview = await previewArchivingRetention(db, { policyId })
    const response = await runBoundedStructuredOutput({
      db,
      context,
      output: 'json',
      collect: ({ transaction }) =>
        exportArchivingRetentionArchive(
          { transaction },
          { policyId, previewToken: preview.previewToken },
        ),
    })
    const exported = await response.json()
    expect(exported.archive.specifications).toMatchObject([
      {
        specification: { responsibleHsaId: null, responsibleDisplayName: null },
        needsReferences: [{ text: 'Original need' }],
      },
    ])
    const input = {
      policyId,
      previewToken: preview.previewToken,
      exportToken: exported.exportToken,
    }
    const result = await executeArchivingRetention(
      db,
      {
        ...input,
        audit: (executor, run) =>
          recordAllowedActionAuditEventWithExecutor(executor, context, {
            action: 'admin.archiving.execute',
            targetId: run.runId,
            targetKind: 'ArchivingRetentionRun',
          }),
      },
      actor,
    )
    expect(result.summary).toMatchObject({
      candidateCount: 1,
      archiveCount: 1,
      deleteCount: 1,
      skippedCount: 0,
    })
    expect(
      await db.query('SELECT id FROM requirements_specifications'),
    ).toEqual([])
    expect(
      await db.query('SELECT id FROM specification_needs_references'),
    ).toEqual([])
    expect(
      await db.query(
        'SELECT deleted_count AS deletedCount FROM archiving_retention_runs',
      ),
    ).toEqual([{ deletedCount: 1 }])
    expect(await db.query('SELECT action FROM action_audit_events')).toEqual([
      { action: 'admin.archiving.execute' },
    ])
  })

  it.each(['edit', 'add', 'remove'] as const)(
    'requires a new export after a child %s while the parent timestamp stays unchanged',
    async change => {
      const db = appDb()
      const policyId = await policy(db)
      const id = await specification(db)
      const input = await exportInput(db, policyId)
      if (change === 'edit')
        await db.query(
          "UPDATE specification_needs_references SET text = N'Changed need' WHERE specification_id = @0",
          [id],
        )
      if (change === 'add')
        await db.query(
          `INSERT INTO specification_needs_references
      (specification_id, text, created_at, updated_at) VALUES (@0, N'Added need', '20000101', '20000101')`,
          [id],
        )
      if (change === 'remove')
        await db.query(
          'DELETE FROM specification_needs_references WHERE specification_id = @0',
          [id],
        )
      await expect(
        executeArchivingRetention(db, input, actor),
      ).rejects.toMatchObject({
        details: { reason: 'stale_archiving_export_content' },
      })
      expect(
        await db.query('SELECT id FROM requirements_specifications'),
      ).toEqual([{ id }])
      expect(await db.query('SELECT id FROM archiving_retention_runs')).toEqual(
        [],
      )
      const fresh = await exportInput(db, policyId)
      expect(
        (await executeArchivingRetention(db, fresh, actor)).summary.deleteCount,
      ).toBe(1)
    },
  )

  it('preserves repeated historical requirement identities and equal package names in an unchanged archive', async () => {
    const db = appDb()
    const policyId = await policy(db)
    const id = await specification(db)
    const area = await createArea(db)
    const requirement = await createPublishedRequirement(
      db,
      area.id,
      'Library content',
    )
    await db.query(
      `INSERT INTO requirements_specification_items
      (requirements_specification_id, requirement_id, requirement_version_id, created_at, note, valid_until)
      VALUES (@0, @1, @2, '20000101', N'Historical inclusion', '20010101'),
      (@0, @1, @2, '20000101', N'Current inclusion', NULL)`,
      [id, requirement.requirementId, requirement.publishedVersionId],
    )
    await db.query(
      `INSERT INTO specification_local_requirements
      (specification_id, unique_id, sequence_number, description, created_at, updated_at, valid_until)
      VALUES (@0, N'LOCAL1', 1, N'Historical local content', '20000101', '20000101', '20010101'),
      (@0, N'LOCAL1', 1, N'Current local content', '20000101', '20000101', NULL)`,
      [id],
    )
    const packages = await db.query(`INSERT INTO requirement_packages
      (name, purpose_and_scope, lead_hsa_id, created_at, updated_at)
      OUTPUT INSERTED.id AS id
      VALUES (N'Same name', N'First scope', N'SE5560000001-sqltest1', '20000101', '20000101'),
      (N'Same name', N'Second scope', N'SE5560000001-sqltest1', '20000101', '20000101')`)
    for (const pkg of packages)
      await db.query(
        `INSERT INTO requirement_version_requirement_packages
      (requirement_version_id, requirement_package_id) VALUES (@0, @1)`,
        [requirement.publishedVersionId, pkg.id],
      )
    const context = await makeRequestContext()
    const preview = await previewArchivingRetention(db, { policyId })
    const response = await runBoundedStructuredOutput({
      db,
      context,
      output: 'json',
      collect: ({ transaction }) =>
        exportArchivingRetentionArchive(
          { transaction },
          { policyId, previewToken: preview.previewToken },
        ),
    })
    const exported = await response.json()
    expect(exported.archive.specifications).toMatchObject([
      {
        libraryRequirements: [
          { specificationItemNote: 'Historical inclusion' },
          { specificationItemNote: 'Current inclusion' },
        ],
        localRequirements: [
          { description: 'Historical local content' },
          { description: 'Current local content' },
        ],
        libraryRequirementPackages: [
          { description: 'First scope' },
          { description: 'Second scope' },
          { description: 'First scope' },
          { description: 'Second scope' },
        ],
      },
    ])
    expect(
      (
        await executeArchivingRetention(
          db,
          {
            policyId,
            previewToken: preview.previewToken,
            exportToken: exported.exportToken,
          },
          actor,
        )
      ).summary.deleteCount,
    ).toBe(1)
  })

  it.each(['later deletion', 'required audit'] as const)(
    'rolls back every subject, run and policy update after a %s failure',
    async failure => {
      const db = appDb()
      const policyId = await policy(db)
      const first = await specification(db, 'ARC1')
      const second = await specification(db, 'ARC2')
      const input = await exportInput(db, policyId)
      if (failure === 'later deletion')
        await db.query(`CREATE TRIGGER fail_retention_delete
      ON requirements_specifications AFTER DELETE AS BEGIN SET NOCOUNT ON;
      IF EXISTS (SELECT 1 FROM deleted WHERE specification_code = N'ARC2') THROW 51000, 'Injected later deletion failure', 1; END`)
      else
        await db.query(`CREATE TRIGGER fail_retention_audit ON action_audit_events AFTER INSERT AS
      BEGIN SET NOCOUNT ON; THROW 51000, 'Injected required audit failure', 1; END`)
      const context = await makeRequestContext()
      await expect(
        executeArchivingRetention(
          db,
          {
            ...input,
            audit: (executor, run) =>
              recordAllowedActionAuditEventWithExecutor(executor, context, {
                action: 'admin.archiving.execute',
                targetId: run.runId,
                targetKind: 'ArchivingRetentionRun',
              }),
          },
          actor,
        ),
      ).rejects.toThrow(/Injected/)
      expect(
        await db.query(
          'SELECT id FROM requirements_specifications ORDER BY id',
        ),
      ).toEqual([{ id: first }, { id: second }])
      expect(
        await db.query('SELECT text FROM specification_needs_references'),
      ).toEqual([{ text: 'Original need' }, { text: 'Original need' }])
      expect(await db.query('SELECT id FROM archiving_retention_runs')).toEqual(
        [],
      )
      expect(
        await db.query(
          'SELECT last_run_at AS lastRunAt, updated_at AS updatedAt FROM archiving_retention_policies',
        ),
      ).toEqual([
        { lastRunAt: null, updatedAt: new Date('2000-01-01T00:00:00Z') },
      ])
      expect(await db.query('SELECT id FROM action_audit_events')).toEqual([])
      await expect(
        executeArchivingRetention(db, input, actor),
      ).rejects.toMatchObject({
        details: { reason: 'missing_archiving_export_confirmation' },
      })
    },
  )

  it('reports zero-match and successful subject deletions from real driver recordsets', async () => {
    const db = appDb()
    const policyId = await policy(db, 'unused_taxonomy_delete')
    const area = await createArea(db)
    await db.query(
      "UPDATE requirement_areas SET updated_at = '20000101' WHERE id = @0",
      [area.id],
    )
    const preview = await previewArchivingRetention(db, { policyId })
    // Substitute an absent subject at the driver boundary to exercise zero-match SQL.
    intercept(db, async (sql, parameters) => {
      if (sql.includes('DELETE area') && parameters) parameters[0] = -1
    })
    const empty = await executeArchivingRetention(
      db,
      { policyId, previewToken: preview.previewToken },
      actor,
    )
    expect(empty.summary).toMatchObject({ deleteCount: 0, skippedCount: 1 })
    expect(await db.query('SELECT id FROM requirement_areas')).toEqual([
      { id: area.id },
    ])
    vi.restoreAllMocks()
    const fresh = await previewArchivingRetention(db, { policyId })
    const deleted = await executeArchivingRetention(
      db,
      { policyId, previewToken: fresh.previewToken },
      actor,
    )
    expect(deleted.summary).toMatchObject({ deleteCount: 1, skippedCount: 0 })
  })

  it('counts a guarded requirement version once even when it also deletes its requirement', async () => {
    const db = appDb()
    const policyId = await policy(db, 'old_requirement_versions_delete')
    const area = await createArea(db)
    const requirement = await createPublishedRequirement(
      db,
      area.id,
      'Old archived version',
    )
    await db.query(
      `UPDATE requirement_versions SET requirement_status_id = 4,
      archived_at = '20000101', status_updated_at = '20000101' WHERE id = @0`,
      [requirement.publishedVersionId],
    )
    const preview = await previewArchivingRetention(db, { policyId })
    expect(preview.summary.candidateCount).toBe(1)
    intercept(db, async (sql, parameters) => {
      if (sql.includes('DECLARE @requirement_id int') && parameters)
        parameters[0] = -1
    })
    const skipped = await executeArchivingRetention(
      db,
      { policyId, previewToken: preview.previewToken },
      actor,
    )
    expect(skipped.summary).toMatchObject({ deleteCount: 0, skippedCount: 1 })
    vi.restoreAllMocks()
    const fresh = await previewArchivingRetention(db, { policyId })
    const result = await executeArchivingRetention(
      db,
      { policyId, previewToken: fresh.previewToken },
      actor,
    )
    expect(result.summary).toMatchObject({ deleteCount: 1, skippedCount: 0 })
    expect(await db.query('SELECT id FROM requirement_versions')).toEqual([])
    expect(await db.query('SELECT id FROM requirements')).toEqual([])
  })

  it.each(['collection', 'final comparison'] as const)(
    'excludes a competing writer during %s until protected work finishes',
    async stage => {
      const db = appDb()
      const policyId = await policy(db)
      const id = await specification(db)
      const preview = await previewArchivingRetention(db, { policyId })
      const input =
        stage === 'final comparison' ? await exportInput(db, policyId) : null
      let writer: Promise<Array<{ changed: number }>> | undefined
      let observedBlockedWriter = false
      intercept(db, async sql => {
        const boundary =
          stage === 'collection'
            ? sql.includes('FROM specification_needs_references')
            : sql.includes('DELETE FROM specification_deviation_endings')
        if (!boundary || writer) return
        const started = Promise.withResolvers<number>()
        writer = db.transaction(async manager => {
          const [{ sessionId }] = await manager.query(
            'SELECT @@SPID AS sessionId',
          )
          started.resolve(sessionId)
          if (stage === 'collection')
            await manager.query(
              "UPDATE requirements_specifications SET name = N'Changed parent' WHERE id = @0",
              [id],
            )
          return manager.query(
            "UPDATE specification_needs_references SET text = N'Changed need' WHERE specification_id = @0; SELECT @@ROWCOUNT AS changed",
            [id],
          )
        })
        void writer.catch(() => {})
        const sessionId = await started.promise
        await vi.waitFor(
          async () => {
            const rows = await db.query(
              'SELECT blocking_session_id AS blocker FROM sys.dm_exec_requests WHERE session_id = @0',
              [sessionId],
            )
            expect(rows[0]?.blocker).toBeGreaterThan(0)
          },
          { timeout: 5000 },
        )
        observedBlockedWriter = true
      })
      let executionError: unknown
      try {
        if (input) {
          try {
            const result = await executeArchivingRetention(db, input, actor)
            expect(result.summary.deleteCount).toBe(1)
          } catch (error) {
            executionError = error
            expect(error).toMatchObject({ driverError: { number: 1205 } })
          }
        } else {
          const exported = await exportArchivingRetentionArchive(db, {
            policyId,
            previewToken: preview.previewToken,
          })
          expect(exported.archive.specifications).toMatchObject([
            {
              specification: { name: 'ARC1 specification' },
              needsReferences: [{ text: 'Original need' }],
            },
          ])
        }
        expect(observedBlockedWriter).toBe(true)
      } finally {
        await writer?.catch(() => {})
      }
      if (executionError) {
        expect(await writer).toEqual([{ changed: 1 }])
        expect(
          await db.query('SELECT id FROM requirements_specifications'),
        ).toEqual([{ id }])
        expect(
          await db.query('SELECT id FROM archiving_retention_runs'),
        ).toEqual([])
        expect(
          await db.query(
            'SELECT last_run_at AS lastRunAt FROM archiving_retention_policies',
          ),
        ).toEqual([{ lastRunAt: null }])
      } else if (stage === 'collection') {
        expect(await writer).toEqual([{ changed: 1 }])
      } else {
        // Either the blocked writer sees deletion, or SQL Server rejects it as a deadlock victim.
        if (!writer) throw new Error('Competing writer did not start')
        const result = await writer.then(
          value => value,
          error => error,
        )
        if (Array.isArray(result)) expect(result).toEqual([{ changed: 0 }])
        else expect(result).toMatchObject({ driverError: { number: 1205 } })
        expect(
          await db.query('SELECT id FROM requirements_specifications'),
        ).toEqual([])
      }
    },
  )
})
