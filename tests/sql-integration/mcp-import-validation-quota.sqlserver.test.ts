import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetAuthConfigForTests } from '@/lib/auth/config'
import {
  getMcpRuntimeSettings,
  patchAiGenerationSettings,
} from '@/lib/dal/ai-settings'
import {
  getApplicationSettings,
  getApplicationSettingsForUpdate,
  updateApplicationSetting,
} from '@/lib/dal/application-settings'
import {
  createRequirementImportValidationSessionAtomically,
  type RequirementImportValidationSessionQuotaCode,
} from '@/lib/dal/requirement-import-validation-sessions'
import type { SqlServerDatabase } from '@/lib/db'
import { REQUIREMENTS_IMPORT_SCHEMA_VERSION } from '@/lib/requirements/import-schema'
import { createRequirementsImportWorkflow } from '@/lib/requirements/import-service'
import {
  createArea,
  makeRequestContext,
  useSqlIntegrationDatabase,
} from './helpers/sql-test-database'

const MIB = 1024 * 1024

function sessionData(
  suffix: string,
  overrides: Partial<{
    creatorPrincipalFingerprint: string
    destinationId: number
    reservedBytes: number
  }> = {},
) {
  return {
    creatorPrincipalFingerprint:
      overrides.creatorPrincipalFingerprint ?? suffix.padStart(64, 'a'),
    destinationId: overrides.destinationId ?? 1,
    destinationKind: 'requirements_library',
    destinationSnapshotJson: '{}',
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    payloadHash: suffix.padStart(64, 'b'),
    referenceDataFingerprint: suffix.padStart(64, 'c'),
    reservedBytes: overrides.reservedBytes ?? 4096,
    submittedPayloadJson: '{}',
    tokenHash: suffix.padStart(64, 'd'),
    validationResultJson: '{}',
  }
}

async function configureQuotas(
  db: SqlServerDatabase,
  values: {
    destination: number
    principal: number
    rate: number
    storage: number
  },
): Promise<void> {
  await db.query(
    `UPDATE ai_settings SET
       mcp_import_max_active_sessions_per_destination = @0,
       mcp_import_max_active_sessions_per_principal = @1,
       mcp_import_max_creations_per_window = @2,
       mcp_import_max_reserved_bytes = @3
     WHERE id = 1`,
    [values.destination, values.principal, values.rate, values.storage],
  )
}

async function expectDatabaseLockWait(
  db: SqlServerDatabase,
  blockingSessionId: number,
): Promise<void> {
  await expect
    .poll(async () => {
      const waiting = await db.query<Array<{ waitingCount: number }>>(
        `SELECT COUNT(*) AS waitingCount FROM sys.dm_exec_requests
       WHERE blocking_session_id = @0 AND wait_type LIKE 'LCK%';`,
        [blockingSessionId],
      )
      return waiting[0].waitingCount
    })
    .toBeGreaterThan(0)
}

describe('MCP import-validation quotas against SQL Server', () => {
  const appDb = useSqlIntegrationDatabase()

  beforeEach(() => {
    // The real import service fingerprints sessions with the auth cookie secret.
    // SQL tests do not load the unit suite's authentication setup.
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

  it.each(['global', 'ai'] as const)(
    'orders a concurrent %s reduction after locked session admission',
    async setting => {
      await updateApplicationSetting(appDb(), 'requirementImportMaxRows', 500)
      await patchAiGenerationSettings(appDb(), { mcpImportMaxRows: 500 })
      await configureQuotas(appDb(), {
        destination: 100,
        principal: 100,
        rate: 200,
        storage: 512 * MIB,
      })
      const locked = Promise.withResolvers<number>()
      const release = Promise.withResolvers<void>()
      const admission = createRequirementImportValidationSessionAtomically(
        appDb(),
        sessionData(setting === 'global' ? 'b1' : 'b2'),
        async executor => {
          const global = await getApplicationSettingsForUpdate(executor)
          const ai = await getMcpRuntimeSettings(executor)
          expect(
            Math.min(global.requirementImportMaxRows, ai.mcpImportMaxRows),
          ).toBe(500)
          const sessions = await executor.query<Array<{ sessionId: number }>>(
            'SELECT @@SPID AS sessionId',
          )
          locked.resolve(sessions[0].sessionId)
          await release.promise
        },
      )
      let reduction: Promise<unknown> | undefined
      try {
        const blockingSessionId = await Promise.race([
          locked.promise,
          admission.then(() => {
            throw new Error('Admission did not acquire budget locks')
          }),
        ])
        reduction =
          setting === 'global'
            ? updateApplicationSetting(appDb(), 'requirementImportMaxRows', 1)
            : patchAiGenerationSettings(appDb(), { mcpImportMaxRows: 1 })
        await expectDatabaseLockWait(appDb(), blockingSessionId)
      } finally {
        release.resolve()
        await Promise.allSettled([admission, reduction])
      }
      await expect(admission).resolves.toHaveProperty('session.id')
      await reduction
      const global = await getApplicationSettings(appDb())
      const ai = await getMcpRuntimeSettings(appDb())
      expect(
        Math.min(global.requirementImportMaxRows, ai.mcpImportMaxRows),
      ).toBe(1)
    },
  )

  it('orders execution after concurrent admission without inverting session and budget locks', async () => {
    await updateApplicationSetting(appDb(), 'requirementImportMaxRows', 500)
    await patchAiGenerationSettings(appDb(), { mcpImportMaxRows: 500 })
    await configureQuotas(appDb(), {
      destination: 100,
      principal: 100,
      rate: 200,
      storage: 512 * MIB,
    })
    const area = await createArea(appDb())
    const workflow = createRequirementsImportWorkflow({
      authorization: { assertAuthorized: async () => {} },
      db: appDb(),
      logger: { info: () => {}, error: () => {} },
    })
    const context = await makeRequestContext()
    const validation = await workflow.manageImport(context, {
      destination: { areaId: area.id, kind: 'requirements_library' },
      operation: 'validate',
      payload: {
        schemaVersion: REQUIREMENTS_IMPORT_SCHEMA_VERSION,
        requirements: [{ description: 'One requirement' }],
      },
    })
    if (!('validationToken' in validation) || !validation.validationToken)
      throw new Error('Expected validation session')
    await updateApplicationSetting(appDb(), 'requirementImportMaxRows', 499)
    const locked = Promise.withResolvers<number>()
    const release = Promise.withResolvers<void>()
    const admission = createRequirementImportValidationSessionAtomically(
      appDb(),
      sessionData('ab'),
      async executor => {
        await getApplicationSettingsForUpdate(executor)
        await getMcpRuntimeSettings(executor)
        const sessions = await executor.query<Array<{ sessionId: number }>>(
          'SELECT @@SPID AS sessionId',
        )
        locked.resolve(sessions[0].sessionId)
        await release.promise
      },
    )
    let execution: ReturnType<typeof workflow.manageImport> | undefined
    try {
      const blockingSessionId = await Promise.race([
        locked.promise,
        admission.then(() => {
          throw new Error('Expected budget locks')
        }),
      ])
      execution = workflow.manageImport(context, {
        operation: 'execute',
        validationToken: validation.validationToken,
      })
      await expectDatabaseLockWait(appDb(), blockingSessionId)
    } finally {
      release.resolve()
      await Promise.allSettled([admission, execution])
    }
    await expect(admission).resolves.toHaveProperty('session.id')
    await expect(execution).resolves.toMatchObject({
      hasErrors: true,
      issues: [expect.objectContaining({ code: 'import_budget_stale' })],
    })
  })

  it.each<{
    code: RequirementImportValidationSessionQuotaCode
    configure: Parameters<typeof configureQuotas>[1]
    first: ReturnType<typeof sessionData>
    second: ReturnType<typeof sessionData>
  }>([
    {
      code: 'import_validation_principal_session_quota_exceeded',
      configure: {
        destination: 100,
        principal: 1,
        rate: 200,
        storage: 512 * MIB,
      },
      first: sessionData('1', {
        creatorPrincipalFingerprint: '1'.repeat(64),
        destinationId: 1,
      }),
      second: sessionData('2', {
        creatorPrincipalFingerprint: '1'.repeat(64),
        destinationId: 2,
      }),
    },
    {
      code: 'import_validation_creation_rate_exceeded',
      configure: {
        destination: 100,
        principal: 100,
        rate: 1,
        storage: 512 * MIB,
      },
      first: sessionData('3', {
        creatorPrincipalFingerprint: '3'.repeat(64),
        destinationId: 3,
      }),
      second: sessionData('4', {
        creatorPrincipalFingerprint: '3'.repeat(64),
        destinationId: 4,
      }),
    },
    {
      code: 'import_validation_destination_session_quota_exceeded',
      configure: {
        destination: 1,
        principal: 100,
        rate: 200,
        storage: 512 * MIB,
      },
      first: sessionData('5', {
        creatorPrincipalFingerprint: 'e'.repeat(64),
        destinationId: 5,
      }),
      second: sessionData('6', {
        creatorPrincipalFingerprint: 'f'.repeat(64),
        destinationId: 5,
      }),
    },
    {
      code: 'import_validation_storage_quota_exceeded',
      configure: {
        destination: 100,
        principal: 100,
        rate: 200,
        storage: 64 * MIB,
      },
      first: sessionData('7', {
        creatorPrincipalFingerprint: '7'.repeat(64),
        destinationId: 7,
        reservedBytes: 40 * MIB,
      }),
      second: sessionData('8', {
        creatorPrincipalFingerprint: '8'.repeat(64),
        destinationId: 8,
        reservedBytes: 40 * MIB,
      }),
    },
  ])('serializes concurrent creation at $code', async scenario => {
    await appDb().query(
      'DELETE FROM requirement_import_validation_rate_buckets; DELETE FROM requirement_import_validation_sessions;',
    )
    await configureQuotas(appDb(), scenario.configure)

    const results = await Promise.all([
      createRequirementImportValidationSessionAtomically(
        appDb(),
        scenario.first,
      ),
      createRequirementImportValidationSessionAtomically(
        appDb(),
        scenario.second,
      ),
    ])

    expect(results.filter(result => 'session' in result)).toHaveLength(1)
    expect(results.filter(result => 'rejection' in result)).toEqual([
      { rejection: expect.objectContaining({ code: scenario.code }) },
    ])
    const rows = (await appDb().query(
      'SELECT COUNT_BIG(*) AS count FROM requirement_import_validation_sessions',
    )) as Array<{ count: number }>
    expect(Number(rows[0]?.count)).toBe(1)
  })
})
