import { NextResponse } from 'next/server'
import {
  aiRunProfileParamsSchema,
  saveAiRunProfileRevisionSchema,
} from '@/lib/ai/admin-contracts'
import { adminAiRead } from '@/lib/ai/admin-http'
import { createAiConnectionAdministrationRuntime } from '@/lib/ai/admin-runtime'
import { getRequestSqlServerDataSource } from '@/lib/db'
import { withRestResponsePolicy } from '@/lib/http/response-policy'
import {
  adminMutationPolicy,
  secureMutationRoute,
} from '@/lib/http/secure-mutation-route'

export const GET = withRestResponsePolicy(async (
  request,
  routeContext: { params: Promise<unknown> },
) => {
  const parsed = aiRunProfileParamsSchema.safeParse(await routeContext.params)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid route parameters.' },
      { status: 400 },
    )
  }
  return adminAiRead(request, service =>
    service.listRunProfileRevisions(parsed.data.profileKey),
  )
})

export const POST = secureMutationRoute({
  bodySchema: saveAiRunProfileRevisionSchema,
  errorMessage: 'Failed to save AI run profile revision.',
  paramsSchema: aiRunProfileParamsSchema,
  policy: adminMutationPolicy(),
  handler: async ({ body, context, params }) => {
    const db = await getRequestSqlServerDataSource()
    const service = createAiConnectionAdministrationRuntime(db, context)
    return NextResponse.json(
      await service.saveRunProfileRevision({
        profileKey: params.profileKey,
        revision: body,
      }),
    )
  },
})
