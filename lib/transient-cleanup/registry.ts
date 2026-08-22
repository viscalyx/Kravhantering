import { createAiForensicEvidenceCleanupTarget } from './ai-forensic-evidence'
import { createAiRunCoordinationCleanupTarget } from './ai-run-coordination-entries'
import { createRequirementImportValidationRateBucketCleanupTarget } from './requirement-import-validation-rate-buckets'
import {
  createRequirementImportValidationSessionCleanupTarget,
  type TransientCleanupQueryExecutor,
} from './requirement-import-validation-sessions'
import type { TransientCleanupTarget } from './runner'

export function createTransientCleanupTargets(
  executor: TransientCleanupQueryExecutor,
): TransientCleanupTarget[] {
  return [
    createAiRunCoordinationCleanupTarget(executor),
    createAiForensicEvidenceCleanupTarget(executor),
    createRequirementImportValidationSessionCleanupTarget(executor),
    createRequirementImportValidationRateBucketCleanupTarget(executor),
  ]
}
