import { NextResponse } from 'next/server'
import { logSanitizedError } from '@/lib/http/safe-errors'
import {
  requirementsMutationPolicy,
  secureMutationRoute,
} from '@/lib/http/secure-mutation-route'
import { toHttpErrorPayload } from '@/lib/requirements/http-errors'
import { createRequirementsRestRuntime } from '@/lib/requirements/server'
import {
  type SpecificationImportExecuteBody as Body,
  specificationImportExecuteBodySchema as bodySchema,
  specificationActionTarget,
} from '../_shared'

export const POST = secureMutationRoute({
  bodySchema,
  policy: requirementsMutationPolicy<Body>(({ body }) => ({
    kind: 'manage_specification_local_requirement',
    operation: 'create',
    ...specificationActionTarget(body.specificationIdOrSlug),
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
        specificationIdOrSlug: body.specificationIdOrSlug,
      })
      return NextResponse.json(result, {
        headers: { 'Cache-Control': 'no-store' },
        status: 201,
      })
    } catch (error) {
      logSanitizedError(
        '[API] Failed to execute specification-local requirements import',
        error,
      )
      const { body: errorBody, status } = toHttpErrorPayload(error)
      return NextResponse.json(errorBody, { status })
    }
  },
})
