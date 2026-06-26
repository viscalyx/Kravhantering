import { readBuildMetadata } from '@/lib/build-metadata'
import { getRequestSqlServerDataSource } from '@/lib/db'

export const LATEST_DATABASE_SCHEMA_VERSION_QUERY = `
IF OBJECT_ID(N'migrations', N'U') IS NULL
  SELECT CAST(NULL AS nvarchar(255)) AS [name]
ELSE
  SELECT TOP (1) [name] AS [name]
  FROM [migrations]
  ORDER BY [id] DESC
`

export type DatabaseSchemaStatusReason =
  | 'expected_database_schema_version_missing'
  | 'database_schema_version_missing'
  | 'database_schema_version_mismatch'
  | 'database_schema_version_check_failed'

export type DatabaseSchemaStatus =
  | {
      expectedDatabaseSchemaVersion: string
      observedDatabaseSchemaVersion: string
      status: 'matches'
    }
  | {
      expectedDatabaseSchemaVersion: string
      observedDatabaseSchemaVersion: string | null
      reason:
        | 'database_schema_version_missing'
        | 'database_schema_version_mismatch'
      status: 'mismatch'
    }
  | {
      expectedDatabaseSchemaVersion: string | null
      observedDatabaseSchemaVersion: null
      reason:
        | 'expected_database_schema_version_missing'
        | 'database_schema_version_check_failed'
      status: 'unknown'
    }

function readNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

export async function readDatabaseSchemaStatus(): Promise<DatabaseSchemaStatus> {
  const expectedDatabaseSchemaVersion = readNonEmptyString(
    readBuildMetadata()?.expectedDatabaseSchemaVersion,
  )
  if (!expectedDatabaseSchemaVersion) {
    return {
      expectedDatabaseSchemaVersion: null,
      observedDatabaseSchemaVersion: null,
      reason: 'expected_database_schema_version_missing',
      status: 'unknown',
    }
  }

  let rows: unknown
  try {
    const db = await getRequestSqlServerDataSource()
    rows = await db.query(LATEST_DATABASE_SCHEMA_VERSION_QUERY)
  } catch {
    return {
      expectedDatabaseSchemaVersion,
      observedDatabaseSchemaVersion: null,
      reason: 'database_schema_version_check_failed',
      status: 'unknown',
    }
  }

  const observedDatabaseSchemaVersion = readNonEmptyString(
    Array.isArray(rows) ? rows[0]?.name : null,
  )
  if (!observedDatabaseSchemaVersion) {
    return {
      expectedDatabaseSchemaVersion,
      observedDatabaseSchemaVersion: null,
      reason: 'database_schema_version_missing',
      status: 'mismatch',
    }
  }
  if (observedDatabaseSchemaVersion !== expectedDatabaseSchemaVersion) {
    return {
      expectedDatabaseSchemaVersion,
      observedDatabaseSchemaVersion,
      reason: 'database_schema_version_mismatch',
      status: 'mismatch',
    }
  }

  return {
    expectedDatabaseSchemaVersion,
    observedDatabaseSchemaVersion,
    status: 'matches',
  }
}
