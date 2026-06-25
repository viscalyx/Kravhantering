import { NextResponse } from 'next/server'
import { logSanitizedError } from '@/lib/http/safe-errors'
import {
  requirementsMutationPolicy,
  secureMutationRoute,
} from '@/lib/http/secure-mutation-route'
import { toHttpErrorPayload } from '@/lib/requirements/http-errors'
import { createRequirementsRestRuntime } from '@/lib/requirements/server'
import {
  type SpecificationImportPreviewBody as Body,
  specificationImportPreviewBodySchema as bodySchema,
  specificationActionTarget,
} from '../_shared'

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
