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
    if (body.action === 'set_operational_status') {
      return NextResponse.json(
        await service.setRunProfileOperationalStatus({
          profileKey: params.profileKey,
          revisionToken: body.revisionToken,
          status: body.status,
        }),
      )
    }
    return NextResponse.json(
      await service.activateRunProfileRevision({
        connectionRevisionToken: body.connectionRevisionToken,
        modelRevisionToken: body.modelRevisionToken,
        profileKey: params.profileKey,
        profileRevisionId: body.profileRevisionId,
        profileRevisionToken: body.profileRevisionToken,
        profileToken: body.profileToken,
      }),
    )
  },
})
