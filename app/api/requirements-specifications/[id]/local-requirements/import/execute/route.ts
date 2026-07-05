import { NextResponse } from 'next/server'
import { z } from 'zod'
import { logSanitizedError } from '@/lib/http/safe-errors'
import {
  requirementsMutationPolicy,
  secureMutationRoute,
} from '@/lib/http/secure-mutation-route'
import { idParamSchema } from '@/lib/http/validation'
import { toHttpErrorPayload } from '@/lib/requirements/http-errors'
import { importExecuteBodySchema } from '@/lib/requirements/import-schema'
import { createRequirementsRestRuntime } from '@/lib/requirements/server'

const paramsSchema = z
  .object({
    id: idParamSchema.shape.id,
  })
  .strict()
const bodySchema = importExecuteBodySchema.omit({ areaId: true })

type Body = z.infer<typeof bodySchema>
type Params = z.infer<typeof paramsSchema>

export const POST = secureMutationRoute({
  bodySchema,
  paramsSchema,
  policy: requirementsMutationPolicy<Body, Params>(({ params }) => ({
    kind: 'manage_specification_local_requirement',
    operation: 'create',
    specificationId: params.id,
  })),
  handler: async ({ body, context, params, request }) => {
    try {
      const { service } = await createRequirementsRestRuntime(request, {
        context,
      })
      const result = await service.executeSpecificationLocalImport(context, {
        ...body,
        specificationId: params.id,
      })
      return NextResponse.json(result, {
        headers: { 'Cache-Control': 'no-store' },
        status: 201,
      })
    } catch (error) {
      logSanitizedError(
        '[API] Failed to execute specification-local requirements import',
        error,
      )
      const { body: errorBody, status } = toHttpErrorPayload(error)
      return NextResponse.json(errorBody, { status })
    }
  },
})
