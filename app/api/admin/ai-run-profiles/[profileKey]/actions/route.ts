import { NextResponse } from 'next/server'
import {
  aiRunProfileActionSchema,
  aiRunProfileParamsSchema,
} from '@/lib/ai/admin-contracts'
import { createAiConnectionAdministrationRuntime } from '@/lib/ai/admin-runtime'
import { getRequestSqlServerDataSource } from '@/lib/db'
import {
  adminMutationPolicy,
  secureMutationRoute,
} from '@/lib/http/secure-mutation-route'

export const POST = secureMutationRoute({
  bodySchema: aiRunProfileActionSchema,
  errorMessage: 'Failed to perform AI run profile action.',
  handlerErrorDetails: 'ai_admin_blockers',
  paramsSchema: aiRunProfileParamsSchema,
  policy: adminMutationPolicy(),
  handler: async ({ body, context, params }) => {
    const db = await getRequestSqlServerDataSource()
    const service = createAiConnectionAdministrationRuntime(db, context)
    return NextResponse.json(
      await service.setRunProfileOperationalStatus({
        profileKey: params.profileKey,
        revisionToken: body.revisionToken,
        status: body.status,
      }),
    )
  },
})
