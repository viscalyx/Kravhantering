import { beforeEach, describe, expect, it, vi } from 'vitest'

const statusState = vi.hoisted(() => ({
  getRequestSqlServerDataSource: vi.fn(),
  readBuildMetadata: vi.fn(),
}))

vi.mock('@/lib/build-metadata', () => ({
  readBuildMetadata: statusState.readBuildMetadata,
}))

vi.mock('@/lib/db', () => ({
  getRequestSqlServerDataSource: statusState.getRequestSqlServerDataSource,
}))

import {
  LATEST_DATABASE_SCHEMA_VERSION_QUERY,
  readDatabaseSchemaStatus,
} from '@/lib/database-schema-status'

const EXPECTED_SCHEMA_VERSION = 'InitialSchema1713720000000'

function setStatusDefaults() {
  const query = vi.fn().mockResolvedValue([{ name: EXPECTED_SCHEMA_VERSION }])
  statusState.readBuildMetadata.mockReturnValue({
    builtAt: '2026-05-21T19:00:00.000Z',
    commitSha: 'abc123',
    expectedDatabaseSchemaVersion: EXPECTED_SCHEMA_VERSION,
    imageTag: 'registry.example/app:1.2.3',
    version: '1.2.3',
  })
  statusState.getRequestSqlServerDataSource.mockResolvedValue({ query })
  return { query }
}

describe('readDatabaseSchemaStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns matches when the database head equals build metadata', async () => {
    const { query } = setStatusDefaults()

    await expect(readDatabaseSchemaStatus()).resolves.toEqual({
      expectedDatabaseSchemaVersion: EXPECTED_SCHEMA_VERSION,
      observedDatabaseSchemaVersion: EXPECTED_SCHEMA_VERSION,
      status: 'matches',
    })
    expect(query).toHaveBeenCalledWith(LATEST_DATABASE_SCHEMA_VERSION_QUERY)
  })

  it('returns unknown without querying when expected schema metadata is missing', async () => {
    setStatusDefaults()
    statusState.readBuildMetadata.mockReturnValue(null)

    await expect(readDatabaseSchemaStatus()).resolves.toEqual({
      expectedDatabaseSchemaVersion: null,
      observedDatabaseSchemaVersion: null,
      reason: 'expected_database_schema_version_missing',
      status: 'unknown',
    })
    expect(statusState.getRequestSqlServerDataSource).not.toHaveBeenCalled()
  })

  it('returns mismatch when the database has no observed migration head', async () => {
    const { query } = setStatusDefaults()
    query.mockResolvedValue([{ name: null }])

    await expect(readDatabaseSchemaStatus()).resolves.toEqual({
      expectedDatabaseSchemaVersion: EXPECTED_SCHEMA_VERSION,
      observedDatabaseSchemaVersion: null,
      reason: 'database_schema_version_missing',
      status: 'mismatch',
    })
  })

  it('returns mismatch when the database head differs from build metadata', async () => {
    const { query } = setStatusDefaults()
    query.mockResolvedValue([{ name: 'OlderSchema1713000000000' }])

    await expect(readDatabaseSchemaStatus()).resolves.toEqual({
      expectedDatabaseSchemaVersion: EXPECTED_SCHEMA_VERSION,
      observedDatabaseSchemaVersion: 'OlderSchema1713000000000',
      reason: 'database_schema_version_mismatch',
      status: 'mismatch',
    })
  })

  it('returns unknown when the database status query fails', async () => {
    const { query } = setStatusDefaults()
    query.mockRejectedValue(new Error('database unavailable'))

    await expect(readDatabaseSchemaStatus()).resolves.toEqual({
      expectedDatabaseSchemaVersion: EXPECTED_SCHEMA_VERSION,
      observedDatabaseSchemaVersion: null,
      reason: 'database_schema_version_check_failed',
      status: 'unknown',
    })
  })
})
