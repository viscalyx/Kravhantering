import { NextResponse } from 'next/server'
import { recordAllowedActionAuditEvent } from '@/lib/audit/action-audit'
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
    const requirementPackage = await archiveRequirementPackage(db, params.id)
    if (!requirementPackage) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    await recordAllowedActionAuditEvent(db, context, {
      action: 'requirement_package.archive',
      targetId: params.id,
      targetKind: 'requirement_package',
    })
    return NextResponse.json(requirementPackage)
  },
})
