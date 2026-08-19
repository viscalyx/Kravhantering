import { NextResponse } from 'next/server'
import { createAiConnectionSchema } from '@/lib/ai/admin-contracts'
import { adminAiRead } from '@/lib/ai/admin-http'
import { createAiConnectionAdministrationRuntime } from '@/lib/ai/admin-runtime'
import { getRequestSqlServerDataSource } from '@/lib/db'
import { withRestResponsePolicy } from '@/lib/http/response-policy'
import {
  adminMutationPolicy,
  secureMutationRoute,
} from '@/lib/http/secure-mutation-route'

export const GET = withRestResponsePolicy(request =>
  adminAiRead(request, service => service.listConnections()),
)

export const POST = secureMutationRoute({
  bodySchema: createAiConnectionSchema,
  errorMessage: 'Failed to create AI connection.',
  policy: adminMutationPolicy(),
  handler: async ({ body, context }) => {
    const db = await getRequestSqlServerDataSource()
    const service = createAiConnectionAdministrationRuntime(db, context)
    return NextResponse.json(await service.createConnection(body), {
      status: 201,
    })
  },
})
