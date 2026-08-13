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
import { createRequirementsRestRuntime } from '@/lib/requirements/server'
import {
  type SpecificationImportPreviewBody as Body,
  buildSpecificationImportPreviewBodySchema,
} from '../_shared'

export const POST = secureMutationRoute<Body>({
  bodyReader: async ({ request }) => {
    const db = await getRequestSqlServerDataSource()
    const budget = requirementImportBudgetFromSettings(
      await getApplicationSettings(db),
    )
    return readRequirementImportRequest(request, {
      budget,
      content: body => (body as { payload?: unknown })?.payload,
      schema: buildSpecificationImportPreviewBodySchema(budget),
    })
  },
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
