import { NextResponse } from 'next/server'
import {
  aiConnectionParamsSchema,
  updateAiConnectionSchema,
} from '@/lib/ai/admin-contracts'
import { adminAiRead } from '@/lib/ai/admin-http'
import { createAiConnectionAdministrationRuntime } from '@/lib/ai/admin-runtime'
import { getRequestSqlServerDataSource } from '@/lib/db'
import { withRestResponsePolicy } from '@/lib/http/response-policy'
import {
  adminMutationPolicy,
  secureMutationRoute,
} from '@/lib/http/secure-mutation-route'

export const GET = withRestResponsePolicy(
  async (request, routeContext: { params: Promise<unknown> }) => {
    const parsed = aiConnectionParamsSchema.safeParse(await routeContext.params)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid route parameters.' },
        { status: 400 },
      )
    }
    return adminAiRead(request, service =>
      service.getConnection(parsed.data.connectionId),
    )
  },
)

export const PATCH = secureMutationRoute({
  bodySchema: updateAiConnectionSchema,
  errorMessage: 'Failed to update AI connection.',
  paramsSchema: aiConnectionParamsSchema,
  policy: adminMutationPolicy(),
  handler: async ({ body, context, params }) => {
    const { revisionToken, ...connection } = body
    const db = await getRequestSqlServerDataSource()
    const service = createAiConnectionAdministrationRuntime(db, context)
    return NextResponse.json(
      await service.updateConnection({
        connection,
        connectionId: params.connectionId,
        revisionToken,
      }),
    )
  },
})
