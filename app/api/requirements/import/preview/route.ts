import { NextResponse } from 'next/server'
import { logSanitizedError } from '@/lib/http/safe-errors'
import {
  requirementsMutationPolicy,
  secureMutationRoute,
} from '@/lib/http/secure-mutation-route'
import { validationError } from '@/lib/requirements/errors'
import {
  createRequirementImportBodyReader,
  requirementImportHttpErrorResponse,
} from '@/lib/requirements/import-http'
import {
  buildImportPreviewBodySchema,
  type ImportPreviewBody,
} from '@/lib/requirements/import-schema'
import { createRequirementsRestRuntime } from '@/lib/requirements/server'

export const POST = secureMutationRoute<ImportPreviewBody>({
  bodyReader: createRequirementImportBodyReader({
    content: body => (body as { payload?: unknown })?.payload,
    schema: buildImportPreviewBodySchema,
  }),
  policy: requirementsMutationPolicy<ImportPreviewBody>(({ body }) => ({
    areaId: body.areaId,
    kind: 'manage_requirement',
    operation: 'create',
  })),
  handler: async ({ body, context, request }) => {
    try {
      if (!body.areaId) {
        throw validationError('areaId is required for library import preview')
      }
      const { service } = await createRequirementsRestRuntime(request, {
        context,
      })
      const preview = await service.previewLibraryImport(context, {
        areaId: body.areaId,
        locale: body.locale,
        payload: body.payload,
      })
      return NextResponse.json(preview)
    } catch (error) {
      logSanitizedError('[API] Failed to preview requirements import', error)
      return requirementImportHttpErrorResponse(error)
    }
  },
})
