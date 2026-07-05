import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { updateSpecificationSchema } from '@/app/api/requirements-specifications/schema'
import {
  canAuthorSpecification,
  deleteSpecification,
  getSpecificationById,
  isSpecificationCodeTaken,
  listSpecificationCoAuthorHsaIds,
  updateSpecification,
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
  handler: async ({ body, params }) => {
    const { id } = params
    const db = await getRequestSqlServerDataSource()

    const spec = await getSpecificationById(db, id)
    if (!spec) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    if (
      body.specificationCode &&
      (await isSpecificationCodeTaken(db, body.specificationCode, spec.id))
    ) {
      return NextResponse.json(
        { error: 'specification_code_taken' },
        { status: 409 },
      )
    }

    const updated = await updateSpecification(db, spec.id, body)
    return NextResponse.json(updated)
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
  handler: async ({ params }) => {
    const { id } = params
    const db = await getRequestSqlServerDataSource()
    const spec = await getSpecificationById(db, id)
    if (!spec) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    await deleteSpecification(db, spec.id)
    return NextResponse.json({ ok: true })
  },
})
