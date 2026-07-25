import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { toSpecificationMutationErrorResponse } from '@/app/api/requirements-specifications/error-response'
import { updateSpecificationSchema } from '@/app/api/requirements-specifications/schema'
import {
  canAuthorSpecification,
  getSpecificationById,
  listSpecificationCoAuthorHsaIds,
} from '@/lib/dal/requirements-specifications'
import { getRequestSqlServerDataSource } from '@/lib/db'
import {
  customMutationPolicy,
  secureMutationRoute,
} from '@/lib/http/secure-mutation-route'
import { idParamSchema, parseRouteParams } from '@/lib/http/validation'
import {
  createDefaultAuthorizationService,
  createRequestContext,
} from '@/lib/requirements/auth'
import { forbiddenError } from '@/lib/requirements/errors'
import { toHttpErrorPayload } from '@/lib/requirements/http-errors'
import { authorize } from '@/lib/requirements/service-shared'
import {
  deleteSpecificationWithAudit,
  updateSpecificationWithAudit,
} from '@/lib/requirements/specification-mutations'
import { specificationPermissions } from '@/lib/specifications/permissions'

export const dynamic = 'force-dynamic'

type Params = Promise<{ id: string }>

const specificationParamSchema = z
  .object({ id: idParamSchema.shape.id })
  .strict()

function isAdmin(roles: readonly string[]): boolean {
  return roles.includes('Admin')
}

export async function GET(
  request: NextRequest,
  { params }: { params: Params },
) {
  const parsedParams = await parseRouteParams(params, specificationParamSchema)
  if (!parsedParams.ok) {
    return parsedParams.response
  }
  try {
    const { id } = parsedParams.data
    const db = await getRequestSqlServerDataSource()
    const context = await createRequestContext(request, 'rest')
    const spec = await getSpecificationById(db, id)
    if (!spec) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    await authorize(
      createDefaultAuthorizationService(db),
      {
        kind: 'get_specification_items',
        specificationId: spec.id,
      },
      context,
    )
    const coAuthorHsaIds = await listSpecificationCoAuthorHsaIds(db, spec.id)
    return NextResponse.json({
      ...spec,
      permissions: specificationPermissions(context, {
        coAuthorHsaIds,
        responsibleHsaId: spec.responsibleHsaId,
      }),
    })
  } catch (error) {
    const { body, status } = toHttpErrorPayload(error)
    return NextResponse.json(body, { status })
  }
}

export const PUT = secureMutationRoute({
  bodySchema: updateSpecificationSchema,
  paramsSchema: specificationParamSchema,
  policy: customMutationPolicy(
    'specification.update',
    async ({ context, params }) => {
      const db = await getRequestSqlServerDataSource()
      const { id } = params as z.infer<typeof specificationParamSchema>
      const spec = await getSpecificationById(db, id)
      if (!spec) return

      const allowed = await canAuthorSpecification(
        db,
        spec.id,
        context.actor.hsaId,
        isAdmin(context.actor.roles),
      )
      if (!allowed) {
        throw forbiddenError('Missing specification author permission', {
          reason: 'specification_author_required',
        })
      }
    },
  ),
  handler: async ({ body, context, params }) => {
    const { id } = params
    const db = await getRequestSqlServerDataSource()

    try {
      const result = await updateSpecificationWithAudit(db, id, body, context)
      if (result.status === 'not_found') {
        return NextResponse.json({ error: 'Not found' }, { status: 404 })
      }
      return NextResponse.json(result.specification)
    } catch (error) {
      const response = toSpecificationMutationErrorResponse(error)
      if (response) return response
      throw error
    }
  },
})

export const DELETE = secureMutationRoute({
  paramsSchema: specificationParamSchema,
  policy: customMutationPolicy(
    'specification.delete',
    async ({ context, params }) => {
      const db = await getRequestSqlServerDataSource()
      const { id } = params as z.infer<typeof specificationParamSchema>
      const spec = await getSpecificationById(db, id)
      if (!spec) return

      const allowed = await canAuthorSpecification(
        db,
        spec.id,
        context.actor.hsaId,
        isAdmin(context.actor.roles),
      )
      if (!allowed) {
        throw forbiddenError('Missing specification author permission', {
          reason: 'specification_author_required',
        })
      }
    },
  ),
  handler: async ({ context, params }) => {
    const { id } = params
    const db = await getRequestSqlServerDataSource()
    const result = await deleteSpecificationWithAudit(db, id, context)
    if (result.status === 'not_found') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    return NextResponse.json({ ok: true })
  },
})
