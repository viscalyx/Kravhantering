import { NextResponse } from 'next/server'
import type { z } from 'zod'
import { logSanitizedError } from '@/lib/http/safe-errors'
import {
  requirementsMutationPolicy,
  secureMutationRoute,
} from '@/lib/http/secure-mutation-route'
import { specificationIdOrSlugSchema } from '@/lib/http/validation'
import { toHttpErrorPayload } from '@/lib/requirements/http-errors'
import { importExecuteBodySchema } from '@/lib/requirements/import-schema'
import { createRequirementsRestRuntime } from '@/lib/requirements/server'

const bodySchema = importExecuteBodySchema
  .omit({ areaId: true })
  .extend({
    specificationIdOrSlug: specificationIdOrSlugSchema,
  })
  .strict()

type Body = z.infer<typeof bodySchema>

function specificationActionTarget(specificationIdOrSlug: string) {
  return /^\d+$/.test(specificationIdOrSlug)
    ? { specificationId: Number(specificationIdOrSlug) }
    : { specificationSlug: specificationIdOrSlug }
}

export const POST = secureMutationRoute({
  bodySchema,
  policy: requirementsMutationPolicy<Body>(({ body }) => ({
    kind: 'manage_specification_local_requirement',
    operation: 'create',
    ...specificationActionTarget(body.specificationIdOrSlug),
  })),
  handler: async ({ body, context, request }) => {
    try {
      const { service } = await createRequirementsRestRuntime(request, {
        context,
      })
      const result = await service.executeSpecificationLocalImport(context, {
        locale: body.locale,
        previewToken: body.previewToken,
        rows: body.rows,
        specificationIdOrSlug: body.specificationIdOrSlug,
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
