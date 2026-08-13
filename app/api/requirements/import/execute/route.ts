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
import {
  buildImportExecuteBodySchema,
  type ImportExecuteBody,
} from '@/lib/requirements/import-schema'
import { createRequirementsRestRuntime } from '@/lib/requirements/server'

export const POST = secureMutationRoute<ImportExecuteBody>({
  bodyReader: createRequirementImportBodyReader({
    content: body => ({ rows: (body as { rows?: unknown })?.rows }),
    schema: buildImportExecuteBodySchema,
  }),
  policy: requirementsMutationPolicy<ImportExecuteBody>(({ body }) => ({
    areaId: body.areaId,
    kind: 'manage_requirement',
    operation: 'create',
  })),
  handler: async ({ body, context, request }) => {
    try {
      const { service } = await createRequirementsRestRuntime(request, {
        context,
      })
      const result = await service.executeLibraryImport(context, {
        ...body,
        areaId: body.areaId,
      })
      return NextResponse.json(result, {
        status: 201,
      })
    } catch (error) {
      logSanitizedError('[API] Failed to execute requirements import', error)
      return requirementImportHttpErrorResponse(error)
    }
  },
})
