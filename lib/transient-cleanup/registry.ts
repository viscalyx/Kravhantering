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
    createAiForensicEvidenceCleanupTarget(executor),
    createRequirementImportValidationSessionCleanupTarget(executor),
    createRequirementImportValidationRateBucketCleanupTarget(executor),
  ]
}

import { createAiForensicEvidenceCleanupTarget } from './ai-forensic-evidence'
