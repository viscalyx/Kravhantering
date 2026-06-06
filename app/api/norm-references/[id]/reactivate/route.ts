import { NextResponse } from 'next/server'
import { recordAllowedActionAuditEvent } from '@/lib/audit/action-audit'
import { reactivateNormReference } from '@/lib/dal/norm-references'
import { getRequestSqlServerDataSource } from '@/lib/db'
import {
  authenticatedMutationPolicy,
  secureMutationRoute,
} from '@/lib/http/secure-mutation-route'
import { idParamSchema } from '@/lib/http/validation'

export const POST = secureMutationRoute({
  paramsSchema: idParamSchema,
  policy: authenticatedMutationPolicy('norm_reference.reactivate'),
  handler: async ({ context, params }) => {
    const db = await getRequestSqlServerDataSource()
    const normReference = await reactivateNormReference(db, params.id)
    if (!normReference) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    await recordAllowedActionAuditEvent(db, context, {
      action: 'norm_reference.reactivate',
      targetId: params.id,
      targetKind: 'norm_reference',
    })
    return NextResponse.json(normReference)
  },
})
