import { NextResponse } from 'next/server'
import { getRequestSqlServerDataSource } from '@/lib/db'
import { secureMutationRoute } from '@/lib/http/secure-mutation-route'
import { idParamSchema } from '@/lib/http/validation'
import { archiveNormReferenceWithAudit } from '@/lib/requirements/norm-reference-mutations'
import { normReferenceMutationPolicy } from '@/lib/requirements/norm-reference-permissions'

export const POST = secureMutationRoute({
  paramsSchema: idParamSchema,
  policy: normReferenceMutationPolicy('norm_reference.archive'),
  handler: async ({ context, params }) => {
    const db = await getRequestSqlServerDataSource()
    const normReference = await archiveNormReferenceWithAudit(
      db,
      params.id,
      context,
    )
    if (!normReference) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    return NextResponse.json(normReference)
  },
})
