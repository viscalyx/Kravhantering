import { describe, expect, it } from 'vitest'
import {
  createRequirementImportValidationSessionAtomically,
  type RequirementImportValidationSessionQuotaCode,
} from '@/lib/dal/requirement-import-validation-sessions'
import type { SqlServerDatabase } from '@/lib/db'
import { useSqlIntegrationDatabase } from './helpers/sql-test-database'

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

describe('MCP import-validation quotas against SQL Server', () => {
  const appDb = useSqlIntegrationDatabase()

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
