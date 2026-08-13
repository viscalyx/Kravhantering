import { NextResponse } from 'next/server'
import { logSanitizedError } from '@/lib/http/safe-errors'
import {
  requirementsMutationPolicy,
  secureMutationRoute,
} from '@/lib/http/secure-mutation-route'
import {
  createRequirementImportBodyReader,
  requirementImportHttpErrorResponse,
} from '@/lib/requirements/import-http'
import { createRequirementsRestRuntime } from '@/lib/requirements/server'
import {
  type SpecificationImportPreviewBody as Body,
  buildSpecificationImportPreviewBodySchema,
} from '../_shared'

export const POST = secureMutationRoute<Body>({
  bodyReader: createRequirementImportBodyReader({
    content: body => (body as { payload?: unknown })?.payload,
    schema: buildSpecificationImportPreviewBodySchema,
  }),
  policy: requirementsMutationPolicy<Body>(({ body }) => ({
    kind: 'manage_specification_local_requirement',
    operation: 'create',
    specificationId: body.specificationId,
  })),
  handler: async ({ body, context, request }) => {
    try {
      const { service } = await createRequirementsRestRuntime(request, {
        context,
      })
      const preview = await service.previewSpecificationLocalImport(context, {
        locale: body.locale,
        payload: body.payload,
        specificationId: body.specificationId,
      })
      return NextResponse.json(preview)
    } catch (error) {
      logSanitizedError(
        '[API] Failed to preview specification-local requirements import',
        error,
      )
      return requirementImportHttpErrorResponse(error)
    }
  },
})
