import { NextResponse } from 'next/server'
import { getApplicationSettings } from '@/lib/dal/application-settings'
import { getRequestSqlServerDataSource } from '@/lib/db'
import { logSanitizedError } from '@/lib/http/safe-errors'
import {
  requirementsMutationPolicy,
  secureMutationRoute,
} from '@/lib/http/secure-mutation-route'
import { validationError } from '@/lib/requirements/errors'
import { requirementImportBudgetFromSettings } from '@/lib/requirements/import-budget'
import {
  readRequirementImportRequest,
  requirementImportHttpErrorResponse,
} from '@/lib/requirements/import-http'
import {
  buildImportPreviewBodySchema,
  type ImportPreviewBody,
} from '@/lib/requirements/import-schema'
import { createRequirementsRestRuntime } from '@/lib/requirements/server'

export const POST = secureMutationRoute<ImportPreviewBody>({
  bodyReader: async ({ request }) => {
    const db = await getRequestSqlServerDataSource()
    const budget = requirementImportBudgetFromSettings(
      await getApplicationSettings(db),
    )
    return readRequirementImportRequest(request, {
      budget,
      content: body => (body as { payload?: unknown })?.payload,
      schema: buildImportPreviewBodySchema(budget),
    })
  },
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
