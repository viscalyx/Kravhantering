import { createAiForensicEvidenceCleanupTarget } from './ai-forensic-evidence'
import { createAiModelVerificationAttemptCleanupTarget } from './ai-model-verification-attempts'
import { createAiRunCoordinationCleanupTarget } from './ai-run-coordination-entries'
import { createHsaVerificationQuotaBucketCleanupTarget } from './hsa-verification-quota-buckets'
import { createRequirementImportValidationRateBucketCleanupTarget } from './requirement-import-validation-rate-buckets'
import {
  createRequirementImportValidationSessionCleanupTarget,
  type TransientCleanupQueryExecutor,
} from './requirement-import-validation-sessions'
import type { TransientCleanupTarget } from './runner'

async function tablesAreApplicable(
  executor: TransientCleanupQueryExecutor,
  tables: string[],
): Promise<boolean> {
  const rows = await executor.query<
    {
      presentTableCount: number
      operableTableCount: number
      namedObjectCount: number
      canViewDefinition: number | null
    }[]
  >(
    `SELECT
      SUM(CASE WHEN OBJECT_ID(objects.name, N'U') IS NULL THEN 0 ELSE 1 END)
        AS presentTableCount,
      SUM(CASE WHEN OBJECT_ID(objects.name) IS NULL THEN 0 ELSE 1 END)
        AS namedObjectCount,
      SUM(CASE WHEN HAS_PERMS_BY_NAME(objects.name, N'OBJECT', N'SELECT') = 1
        AND HAS_PERMS_BY_NAME(objects.name, N'OBJECT',
          CASE WHEN objects.name = N'dbo.ai_forensic_capture_windows'
            THEN N'UPDATE' ELSE N'DELETE' END) = 1
        THEN 1 ELSE 0 END) AS operableTableCount,
      HAS_PERMS_BY_NAME(DB_NAME(), N'DATABASE', N'VIEW DEFINITION')
        AS canViewDefinition
    FROM (VALUES ${tables.map((_, index) => `(@${index})`).join(', ')})
      AS objects(name)`,
    tables.map(table => `dbo.${table}`),
  )
  const row = rows[0]
  if (
    row?.presentTableCount === tables.length &&
    row.operableTableCount === tables.length
  ) {
    for (const table of tables) {
      // Compile columns used only by purge paths even when no rows are expired.
      const columns =
        table === 'ai_forensic_capture_windows'
          ? 'id, operation, direction, is_open'
          : table === 'ai_model_verification_attempts'
            ? 'id, expires_at'
            : table === 'ai_run_coordination_entries'
              ? 'id, queue_sequence'
              : 'id'
      await executor.query(`SELECT TOP (0) ${columns} FROM dbo.${table}`)
    }
    return true
  }
  // Metadata visibility is required to prove absence. A partially installed
  // target or an object of another kind is incompatible, never inapplicable.
  if (row?.namedObjectCount === 0 && row.canViewDefinition === 1) return false
  throw new Error('cleanup target schema inspection failed')
}

export function createTransientCleanupTargets(
  executor: TransientCleanupQueryExecutor,
): TransientCleanupTarget[] {
  return [
    createAiModelVerificationAttemptCleanupTarget(executor),
    createAiRunCoordinationCleanupTarget(executor),
    createAiForensicEvidenceCleanupTarget(executor),
    createHsaVerificationQuotaBucketCleanupTarget(executor),
    createRequirementImportValidationSessionCleanupTarget(executor),
    createRequirementImportValidationRateBucketCleanupTarget(executor),
  ].map(target => ({
    ...target,
    isApplicable: () =>
      tablesAreApplicable(
        executor,
        target.kind === 'ai_forensic_evidence'
          ? ['ai_forensic_capture_windows', 'ai_forensic_evidence_events']
          : [target.kind],
      ),
  }))
}
