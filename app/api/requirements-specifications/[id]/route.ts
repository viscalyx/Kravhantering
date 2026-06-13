import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { updateSpecificationSchema } from '@/app/api/specifications/schema'
import {
  canAuthorSpecification,
  deleteSpecification,
  getSpecificationById,
  getSpecificationBySlug,
  isSlugTaken,
  listSpecificationCoAuthorHsaIds,
  updateSpecification,
} from '@/lib/dal/requirements-specifications'
import type { SqlServerDatabase } from '@/lib/db'
import { getRequestSqlServerDataSource } from '@/lib/db'
import {
  customMutationPolicy,
  secureMutationRoute,
} from '@/lib/http/secure-mutation-route'
import {
  parseRouteParams,
  specificationIdOrSlugSchema,
} from '@/lib/http/validation'
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
  .object({
    id: specificationIdOrSlugSchema,
  })
  .strict()

async function resolveSpecification(db: SqlServerDatabase, idOrSlug: string) {
  if (/^\d+$/.test(idOrSlug)) return getSpecificationById(db, Number(idOrSlug))
  return getSpecificationBySlug(db, idOrSlug)
}

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
    const spec = await resolveSpecification(db, id)
    if (!spec) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    await authorize(
      createDefaultAuthorizationService(db),
      {
        kind: 'get_specification_items',
        specificationId: spec.id,
        specificationSlug: /^\d+$/.test(id) ? undefined : id,
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
      const spec = await resolveSpecification(db, id)
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

    const spec = await resolveSpecification(db, id)
    if (!spec) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    if (body.uniqueId && (await isSlugTaken(db, body.uniqueId, spec.id))) {
      return NextResponse.json({ error: 'slug_taken' }, { status: 409 })
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
      const spec = await resolveSpecification(db, id)
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
    const spec = await resolveSpecification(db, id)
    if (!spec) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    await deleteSpecification(db, spec.id)
    return NextResponse.json({ ok: true })
  },
})
