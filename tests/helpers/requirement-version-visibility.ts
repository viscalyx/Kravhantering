import type { SqlServerDatabase } from '@/lib/db'
import {
  STATUS_ARCHIVED,
  STATUS_DRAFT,
  STATUS_PUBLISHED,
} from '@/lib/requirements/status-constants.mjs'

export function createRequirementVersionDatabase(
  statusId = STATUS_DRAFT,
  areaAuthor = false,
): SqlServerDatabase {
  const versions = [
    {
      id: 12,
      requirementId: 11,
      versionNumber: 2,
      statusId,
      description: 'Confidential draft',
      acceptanceCriteria: 'Confidential criteria',
      publishedAt:
        statusId === STATUS_ARCHIVED ? '2026-08-01T00:00:00.000Z' : null,
    },
    {
      id: 11,
      requirementId: 11,
      versionNumber: 1,
      statusId: STATUS_PUBLISHED,
      description: 'Published baseline',
      publishedAt: '2026-09-01T00:00:00.000Z',
    },
  ]
  const db = {
    async transaction<T>(
      operation: (executor: SqlServerDatabase) => Promise<T>,
    ): Promise<T> {
      return operation(db)
    },
    async query(sql: string): Promise<Array<Record<string, unknown>>> {
      if (sql.includes('AS hasPublishedVersion')) {
        return [
          { id: 11, uniqueId: 'INT0011', areaId: 7, hasPublishedVersion: 1 },
        ]
      }
      if (sql.includes('FROM requirements requirement')) {
        return [
          { id: 11, uniqueId: 'INT0011', areaId: 7, requirementAreaId: 7 },
        ]
      }
      if (sql.includes('FROM requirements WHERE unique_id')) return [{ id: 11 }]
      if (sql.includes('FROM requirement_areas area'))
        return areaAuthor ? [{ id: 7 }] : []
      if (sql.includes('FROM requirement_versions version')) return versions
      if (
        sql.includes('INSERT INTO action_audit_events') ||
        sql.includes('FROM requirement_version_norm_references') ||
        sql.includes('FROM requirement_version_requirement_packages') ||
        sql.includes('FROM requirements_specification_items')
      )
        return []
      throw new Error(`Unexpected fixture query: ${sql}`)
    },
  } as unknown as SqlServerDatabase
  return db
}
