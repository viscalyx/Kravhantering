import { NextResponse } from 'next/server'
import { recordAllowedActionAuditEvent } from '@/lib/audit/action-audit'
import { archiveNormReference } from '@/lib/dal/norm-references'
import { getRequestSqlServerDataSource } from '@/lib/db'
import {
  customMutationPolicy,
  secureMutationRoute,
} from '@/lib/http/secure-mutation-route'
import { idParamSchema } from '@/lib/http/validation'
import { requireNormReferencePermission } from '@/lib/requirements/norm-reference-permissions'

export const POST = secureMutationRoute({
  paramsSchema: idParamSchema,
  policy: customMutationPolicy('norm_reference.archive', ({ context }) => {
    requireNormReferencePermission(context, 'norm_reference.archive')
  }),
  handler: async ({ context, params }) => {
    const db = await getRequestSqlServerDataSource()
    const normReference = await archiveNormReference(db, params.id)
    if (!normReference) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    await recordAllowedActionAuditEvent(db, context, {
      action: 'norm_reference.archive',
      targetId: params.id,
      targetKind: 'norm_reference',
    })
    return NextResponse.json(normReference)
  },
})
