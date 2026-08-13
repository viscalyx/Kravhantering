import { NextResponse } from 'next/server'
import { getApplicationSettings } from '@/lib/dal/application-settings'
import { getRequestSqlServerDataSource } from '@/lib/db'
import { logSanitizedError } from '@/lib/http/safe-errors'
import {
  requirementsMutationPolicy,
  secureMutationRoute,
} from '@/lib/http/secure-mutation-route'
import { requirementImportBudgetFromSettings } from '@/lib/requirements/import-budget'
import {
  readRequirementImportRequest,
  requirementImportHttpErrorResponse,
} from '@/lib/requirements/import-http'
import {
  buildImportExecuteBodySchema,
  type ImportExecuteBody,
} from '@/lib/requirements/import-schema'
import { createRequirementsRestRuntime } from '@/lib/requirements/server'

export const POST = secureMutationRoute<ImportExecuteBody>({
  bodyReader: async ({ request }) => {
    const db = await getRequestSqlServerDataSource()
    const budget = requirementImportBudgetFromSettings(
      await getApplicationSettings(db),
    )
    return readRequirementImportRequest(request, {
      budget,
      content: body => ({ rows: (body as { rows?: unknown })?.rows }),
      schema: buildImportExecuteBodySchema(budget),
    })
  },
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
