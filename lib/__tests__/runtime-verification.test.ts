import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  requireVerifiedRuntimeSqlConnection,
  verifyRuntimeSqlConnection,
} from '@/lib/typeorm/runtime-verification'

vi.mock('@/lib/runtime/build-target', () => ({ BUILD_TARGET: 'prod' }))

const valid = {
  loginName: 'app',
  effectiveLogin: 'app',
  databaseUser: 'app',
  databaseName: 'application',
  runtimeRole: 1,
  missing: '[]',
  unexpected: '[]',
  canConnect: 1,
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('application SQL deployment verification', () => {
  it('requires an independent expected identity in production', async () => {
    vi.stubEnv('DB_RUNTIME_USER', '')
    const db = { query: vi.fn() }
    await expect(requireVerifiedRuntimeSqlConnection(db)).rejects.toMatchObject(
      {
        reason: 'sql_runtime_identity_not_configured',
      },
    )
    expect(db.query).not.toHaveBeenCalled()
  })

  it.each([{ databaseUser: 'migration' }, { effectiveLogin: 'impersonated' }])(
    'rejects a mismatched identity: %j',
    async change => {
      const db = { query: vi.fn().mockResolvedValue([{ ...valid, ...change }]) }
      await expect(verifyRuntimeSqlConnection(db, 'app')).rejects.toMatchObject(
        {
          reason: 'sql_runtime_identity_mismatch',
        },
      )
    },
  )

  it.each([
    { runtimeRole: 0 },
    { missing: '[{"permissionName":"SELECT"}]' },
    { unexpected: '[{"permissionName":"CONTROL"}]' },
  ])('rejects incompatible effective permissions: %j', async change => {
    const db = { query: vi.fn().mockResolvedValue([{ ...valid, ...change }]) }
    await expect(verifyRuntimeSqlConnection(db, 'app')).rejects.toMatchObject({
      reason: 'sql_runtime_permissions_mismatch',
    })
  })

  it.each([
    [],
    [valid, valid],
    [{ ...valid, databaseUser: null }],
    [{ ...valid, runtimeRole: null }],
    [{ ...valid, canConnect: 0 }],
    [{ ...valid, missing: null }],
    [{ ...valid, unexpected: '{}' }],
    [{ ...valid, unexpected: 'invalid' }],
    null,
  ])('fails closed on unverifiable evidence %#', async rows => {
    const db = { query: vi.fn().mockResolvedValue(rows) }
    await expect(verifyRuntimeSqlConnection(db, 'app')).rejects.toMatchObject({
      reason: 'sql_runtime_verification_unavailable',
      evidence: {},
    })
  })

  it('discards driver details and retries failed verification', async () => {
    vi.stubEnv('DB_RUNTIME_USER', 'app')
    const log = vi.spyOn(console, 'info').mockImplementation(() => {})
    const db = {
      query: vi
        .fn()
        .mockRejectedValueOnce(new Error('mssql://app:password@host/database'))
        .mockResolvedValue([valid]),
    }
    await expect(requireVerifiedRuntimeSqlConnection(db)).rejects.toMatchObject(
      {
        message: 'sql_runtime_verification_unavailable',
        evidence: {},
      },
    )
    await expect(
      requireVerifiedRuntimeSqlConnection(db),
    ).resolves.toBeUndefined()
    expect(log).toHaveBeenCalledWith(
      '[sql-runtime-verification] passed',
      expect.objectContaining({
        loginName: 'app',
        databaseUser: 'app',
        missingPermissions: 0,
        unexpectedPermissions: 0,
      }),
    )
    expect(JSON.stringify(log.mock.calls)).not.toContain('password')
  })

  it('reuses a successful result only for the same DataSource and intended identity', async () => {
    vi.stubEnv('DB_RUNTIME_USER', 'app')
    vi.spyOn(console, 'info').mockImplementation(() => {})
    const db = { query: vi.fn().mockResolvedValue([valid]) }
    await Promise.all([
      requireVerifiedRuntimeSqlConnection(db),
      requireVerifiedRuntimeSqlConnection(db),
    ])
    await requireVerifiedRuntimeSqlConnection(db)
    expect(db.query).toHaveBeenCalledTimes(1)
    vi.stubEnv('DB_RUNTIME_USER', 'other')
    await expect(requireVerifiedRuntimeSqlConnection(db)).rejects.toMatchObject(
      {
        reason: 'sql_runtime_identity_mismatch',
      },
    )
    expect(db.query).toHaveBeenCalledTimes(2)
    vi.stubEnv('DB_RUNTIME_USER', 'app')
    const replacement = {
      query: vi.fn().mockRejectedValue(new Error('offline')),
    }
    await expect(
      requireVerifiedRuntimeSqlConnection(replacement),
    ).rejects.toMatchObject({
      reason: 'sql_runtime_verification_unavailable',
    })
  })
})
