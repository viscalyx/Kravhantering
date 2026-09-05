import { createHash } from 'node:crypto'
import type { TransientCleanupQueryExecutor } from './requirement-import-validation-sessions'

// Object IDs and generated constraint names vary across otherwise identical
// databases. Hash the ordered definitions that govern cleanup instead.
export async function cleanupSchemaFingerprint(
  executor: TransientCleanupQueryExecutor,
): Promise<string> {
  const rows = await executor.query<
    { canViewDefinition: number; metadata: string }[]
  >(`SELECT
    HAS_PERMS_BY_NAME(DB_NAME(), N'DATABASE', N'VIEW DEFINITION') AS canViewDefinition,
    (SELECT tables.name,
      (SELECT columns.name, TYPE_NAME(columns.user_type_id) AS type,
        columns.max_length, columns.precision, columns.scale,
        columns.is_nullable, columns.is_identity, columns.collation_name,
        computed.definition AS computed_definition, defaults.definition AS default_definition
       FROM sys.columns AS columns
       LEFT JOIN sys.computed_columns AS computed ON computed.object_id = columns.object_id AND computed.column_id = columns.column_id
       LEFT JOIN sys.default_constraints AS defaults ON defaults.object_id = columns.default_object_id
       WHERE columns.object_id = tables.object_id ORDER BY columns.name FOR JSON PATH) AS columns,
      (SELECT definition, is_disabled FROM sys.check_constraints
       WHERE parent_object_id = tables.object_id ORDER BY definition FOR JSON PATH) AS checks,
      (SELECT indexes.is_unique, indexes.type, indexes.filter_definition, indexes.is_disabled,
        (SELECT COL_NAME(index_columns.object_id, index_columns.column_id) AS name,
          index_columns.key_ordinal, index_columns.is_descending_key, index_columns.is_included_column
         FROM sys.index_columns WHERE index_columns.object_id = indexes.object_id
          AND index_columns.index_id = indexes.index_id ORDER BY index_columns.index_column_id FOR JSON PATH) AS columns
       FROM sys.indexes AS indexes WHERE indexes.object_id = tables.object_id
       ORDER BY indexes.name FOR JSON PATH) AS indexes,
      (SELECT OBJECT_SCHEMA_NAME(keys.parent_object_id) AS parent_schema,
        OBJECT_NAME(keys.parent_object_id) AS parent_table,
        OBJECT_SCHEMA_NAME(keys.referenced_object_id) AS referenced_schema,
        OBJECT_NAME(keys.referenced_object_id) AS referenced_table,
        keys.delete_referential_action, keys.update_referential_action, keys.is_disabled,
        (SELECT COL_NAME(parent_object_id, parent_column_id) AS parent_column,
          COL_NAME(referenced_object_id, referenced_column_id) AS referenced_column
         FROM sys.foreign_key_columns WHERE constraint_object_id = keys.object_id
         ORDER BY constraint_column_id FOR JSON PATH) AS columns
       FROM sys.foreign_keys AS keys WHERE keys.parent_object_id = tables.object_id
         OR keys.referenced_object_id = tables.object_id
       ORDER BY parent_schema, parent_table, referenced_schema, referenced_table, columns FOR JSON PATH) AS foreign_keys,
      (SELECT OBJECT_DEFINITION(object_id) AS definition, is_disabled
       FROM sys.triggers WHERE parent_id = tables.object_id ORDER BY definition FOR JSON PATH) AS triggers
     FROM sys.tables AS tables WHERE SCHEMA_NAME(tables.schema_id) = N'dbo'
       AND tables.name IN (N'ai_run_coordination_entries', N'ai_forensic_capture_windows',
         N'ai_forensic_evidence_events', N'hsa_verification_quota_buckets',
         N'requirement_import_validation_sessions', N'requirement_import_validation_rate_buckets')
     ORDER BY tables.name FOR JSON PATH) AS metadata`)
  const row = rows[0]
  if (row?.canViewDefinition !== 1 || typeof row.metadata !== 'string')
    throw new Error('cleanup schema metadata unavailable')
  return createHash('sha256').update(row.metadata).digest('hex')
}
