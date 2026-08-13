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
  type SpecificationImportExecuteBody as Body,
  buildSpecificationImportExecuteBodySchema,
} from '../_shared'

export const POST = secureMutationRoute<Body>({
  bodyReader: createRequirementImportBodyReader({
    content: body => ({ rows: (body as { rows?: unknown })?.rows }),
    schema: buildSpecificationImportExecuteBodySchema,
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
      const result = await service.executeSpecificationLocalImport(context, {
        locale: body.locale,
        previewToken: body.previewToken,
        rows: body.rows,
        specificationId: body.specificationId,
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
