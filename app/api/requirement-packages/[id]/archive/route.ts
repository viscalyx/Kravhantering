import { NextResponse } from 'next/server'
import { recordAllowedActionAuditEvent } from '@/lib/audit/action-audit'
import { recordRequirementSelectionCleanupAudit } from '@/lib/audit/requirement-selection-cleanup-audit'
import { archiveRequirementPackage } from '@/lib/dal/requirement-packages'
import { getRequestSqlServerDataSource } from '@/lib/db'
import {
  authenticatedMutationPolicy,
  secureMutationRoute,
} from '@/lib/http/secure-mutation-route'
import { idParamSchema } from '@/lib/http/validation'

export const POST = secureMutationRoute({
  paramsSchema: idParamSchema,
  policy: authenticatedMutationPolicy('requirement_package.archive'),
  handler: async ({ context, params }) => {
    const db = await getRequestSqlServerDataSource()
    const result = await archiveRequirementPackage(db, params.id)
    if (!result) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    await recordAllowedActionAuditEvent(db, context, {
      action: 'requirement_package.archive',
      targetId: params.id,
      targetKind: 'requirement_package',
    })
    await recordRequirementSelectionCleanupAudit(db, context, {
      cleanup: result.cleanup,
      originAction: 'requirement_package.archive',
      originTargetId: params.id,
      originTargetKind: 'requirement_package',
    })
    return NextResponse.json(result.requirementPackage)
  },
})
