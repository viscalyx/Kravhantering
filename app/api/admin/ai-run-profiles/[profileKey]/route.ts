import { NextResponse } from 'next/server'
import {
  aiRunProfileParamsSchema,
  saveAiRunProfileSchema,
} from '@/lib/ai/admin-contracts'
import { createAiConnectionAdministrationRuntime } from '@/lib/ai/admin-runtime'
import { getRequestSqlServerDataSource } from '@/lib/db'
import {
  adminMutationPolicy,
  secureMutationRoute,
} from '@/lib/http/secure-mutation-route'

export const PATCH = secureMutationRoute({
  bodySchema: saveAiRunProfileSchema,
  errorMessage: 'Failed to save AI run profile.',
  handlerErrorDetails: 'ai_admin_blockers',
  paramsSchema: aiRunProfileParamsSchema,
  policy: adminMutationPolicy(),
  handler: async ({ body, context, params }) => {
    const db = await getRequestSqlServerDataSource()
    const service = createAiConnectionAdministrationRuntime(db, context)
    return NextResponse.json(
      await service.saveRunProfile({
        profile: body,
        profileKey: params.profileKey,
      }),
    )
  },
})
