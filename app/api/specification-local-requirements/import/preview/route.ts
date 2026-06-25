import { NextResponse } from 'next/server'
import type { z } from 'zod'
import { logSanitizedError } from '@/lib/http/safe-errors'
import {
  requirementsMutationPolicy,
  secureMutationRoute,
} from '@/lib/http/secure-mutation-route'
import { specificationIdOrSlugSchema } from '@/lib/http/validation'
import { toHttpErrorPayload } from '@/lib/requirements/http-errors'
import { importPreviewBodySchema } from '@/lib/requirements/import-schema'
import { createRequirementsRestRuntime } from '@/lib/requirements/server'

const bodySchema = importPreviewBodySchema
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
      const preview = await service.previewSpecificationLocalImport(context, {
        locale: body.locale,
        payload: body.payload,
        specificationIdOrSlug: body.specificationIdOrSlug,
      })
      return NextResponse.json(preview, {
        headers: { 'Cache-Control': 'no-store' },
      })
    } catch (error) {
      logSanitizedError(
        '[API] Failed to preview specification-local requirements import',
        error,
      )
      const { body: errorBody, status } = toHttpErrorPayload(error)
      return NextResponse.json(errorBody, { status })
    }
  },
})
