import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getApplicationSettings } from '@/lib/dal/application-settings'
import { getRequestSqlServerDataSource } from '@/lib/db'
import { logSanitizedError } from '@/lib/http/safe-errors'
import {
  requirementsMutationPolicy,
  secureMutationRoute,
} from '@/lib/http/secure-mutation-route'
import { idParamSchema } from '@/lib/http/validation'
import { requirementImportBudgetFromSettings } from '@/lib/requirements/import-budget'
import {
  readRequirementImportRequest,
  requirementImportHttpErrorResponse,
} from '@/lib/requirements/import-http'
import {
  buildImportPreviewBodySchema,
  importPreviewBodySchema,
} from '@/lib/requirements/import-schema'
import { createRequirementsRestRuntime } from '@/lib/requirements/server'

const paramsSchema = z
  .object({
    id: idParamSchema.shape.id,
  })
  .strict()
const bodySchema = importPreviewBodySchema.omit({ areaId: true })

type Body = z.infer<typeof bodySchema>
type Params = z.infer<typeof paramsSchema>

export const POST = secureMutationRoute<Body, Params>({
  bodyReader: async ({ request }) => {
    const db = await getRequestSqlServerDataSource()
    const budget = requirementImportBudgetFromSettings(
      await getApplicationSettings(db),
    )
    return readRequirementImportRequest(request, {
      budget,
      content: body => (body as { payload?: unknown })?.payload,
      schema: buildImportPreviewBodySchema(budget).omit({ areaId: true }),
    })
  },
  paramsSchema,
  policy: requirementsMutationPolicy<Body, Params>(({ params }) => ({
    kind: 'manage_specification_local_requirement',
    operation: 'create',
    specificationId: params.id,
  })),
  handler: async ({ body, context, params, request }) => {
    try {
      const { service } = await createRequirementsRestRuntime(request, {
        context,
      })
      const preview = await service.previewSpecificationLocalImport(context, {
        locale: body.locale,
        payload: body.payload,
        specificationId: params.id,
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
