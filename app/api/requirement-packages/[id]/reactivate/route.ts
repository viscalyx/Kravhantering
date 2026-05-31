import { NextResponse } from 'next/server'
import { recordAllowedActionAuditEvent } from '@/lib/audit/action-audit'
import { reactivateRequirementPackage } from '@/lib/dal/requirement-packages'
import { getRequestSqlServerDataSource } from '@/lib/db'
import {
  customMutationPolicy,
  secureMutationRoute,
} from '@/lib/http/secure-mutation-route'
import { idParamSchema } from '@/lib/http/validation'

export const POST = secureMutationRoute({
  paramsSchema: idParamSchema,
  policy: customMutationPolicy('requirement_package', () => {}),
  handler: async ({ context, params }) => {
    const db = await getRequestSqlServerDataSource()
    const requirementPackage = await reactivateRequirementPackage(db, params.id)
    if (!requirementPackage) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    await recordAllowedActionAuditEvent(db, context, {
      action: 'requirement_package.reactivate',
      targetId: params.id,
      targetKind: 'requirement_package',
    })
    return NextResponse.json(requirementPackage)
  },
})
