import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getRequestSqlServerDataSource } from '@/lib/db'
import { withRestResponsePolicy } from '@/lib/http/response-policy'
import {
  requirementsMutationPolicy,
  secureMutationRoute,
} from '@/lib/http/secure-mutation-route'
import { idParamSchema, parseRouteParams } from '@/lib/http/validation'
import { toHttpErrorPayload } from '@/lib/requirements/http-errors'
import { createRequirementsRestRuntime } from '@/lib/requirements/server'
import { agreementMutationSchema } from '@/lib/specifications/agreement-contract'
import { createSpecificationAgreementWorkflow } from '@/lib/specifications/agreements'

export const dynamic = 'force-dynamic'

export const GET = withRestResponsePolicy(
  async (
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
  ) => {
    const parsed = await parseRouteParams(params, idParamSchema)
    if (!parsed.ok) return parsed.response
    try {
      const runtime = await createRequirementsRestRuntime(request)
      const workflow = createSpecificationAgreementWorkflow(runtime.db)
      const query = z
        .object({
          itemRef: z
            .string()
            .regex(/^lib:[1-9]\d*$/)
            .optional(),
          versionSearch: z.string().max(250).optional(),
        })
        .strict()
        .safeParse(Object.fromEntries(request.nextUrl.searchParams))
      if (!query.success)
        return NextResponse.json(
          { error: 'Invalid query parameters' },
          { status: 400 },
        )
      const { itemRef, versionSearch } = query.data
      const result = itemRef
        ? await workflow.compare(runtime.context, parsed.data.id, itemRef)
        : await workflow.read(runtime.context, parsed.data.id, versionSearch)
      return NextResponse.json(result)
    } catch (error) {
      const { body, status } = toHttpErrorPayload(error)
      return NextResponse.json(body, { status })
    }
  },
)

export const POST = secureMutationRoute({
  paramsSchema: idParamSchema,
  bodySchema: agreementMutationSchema,
  policy: requirementsMutationPolicy(
    ({ params }: { params: { id: number } }) => ({
      kind: 'manage_requirement_applications',
      operation: 'update',
      specificationId: params.id,
    }),
  ),
  handler: async ({ context, db, params, body }) => {
    const result = await createSpecificationAgreementWorkflow(
      db ?? (await getRequestSqlServerDataSource()),
    ).mutate(context, params.id, body)
    return NextResponse.json(result ?? { ok: true })
  },
})
