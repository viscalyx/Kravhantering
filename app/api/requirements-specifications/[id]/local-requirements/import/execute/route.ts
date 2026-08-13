import { NextResponse } from 'next/server'
import type { z } from 'zod'
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
  buildImportExecuteBodySchema,
  importExecuteBodySchema,
} from '@/lib/requirements/import-schema'
import { createRequirementsRestRuntime } from '@/lib/requirements/server'

const paramsSchema = idParamSchema
const bodySchema = importExecuteBodySchema.omit({ areaId: true })

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
      content: body => ({ rows: (body as { rows?: unknown })?.rows }),
      schema: buildImportExecuteBodySchema(budget).omit({ areaId: true }),
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
      const result = await service.executeSpecificationLocalImport(context, {
        ...body,
        specificationId: params.id,
      })
      return NextResponse.json(result, {
        status: 201,
      })
    } catch (error) {
      logSanitizedError(
        '[API] Failed to execute specification-local requirements import',
        error,
      )
      return requirementImportHttpErrorResponse(error)
    }
  },
})
