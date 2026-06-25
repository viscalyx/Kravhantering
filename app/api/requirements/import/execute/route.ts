import { NextResponse } from 'next/server'
import { logSanitizedError } from '@/lib/http/safe-errors'
import {
  requirementsMutationPolicy,
  secureMutationRoute,
} from '@/lib/http/secure-mutation-route'
import { toHttpErrorPayload } from '@/lib/requirements/http-errors'
import {
  type ImportExecuteBody,
  importExecuteBodySchema,
} from '@/lib/requirements/import-schema'
import { createRequirementsRestRuntime } from '@/lib/requirements/server'

export const POST = secureMutationRoute({
  bodySchema: importExecuteBodySchema,
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
        headers: { 'Cache-Control': 'no-store' },
        status: 201,
      })
    } catch (error) {
      logSanitizedError('[API] Failed to execute requirements import', error)
      const { body: errorBody, status } = toHttpErrorPayload(error)
      return NextResponse.json(errorBody, { status })
    }
  },
})
