import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { updateSpecificationSchema } from '@/app/api/specifications/schema'
import {
  canAuthorSpecification,
  deleteSpecification,
  getSpecificationById,
  getSpecificationBySlug,
  isSlugTaken,
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
import { forbiddenError, validationError } from '@/lib/requirements/errors'
import { resolveVerifiedRequirementResponsibilityPerson } from '@/lib/requirements/responsibility-person-verification'

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
  _request: NextRequest,
  { params }: { params: Params },
) {
  const parsedParams = await parseRouteParams(params, specificationParamSchema)
  if (!parsedParams.ok) {
    return parsedParams.response
  }
  const { id } = parsedParams.data
  const db = await getRequestSqlServerDataSource()
  const spec = await resolveSpecification(db, id)
  if (!spec) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(spec)
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

    if (body.responsibleHsaId !== undefined) {
      const coAuthorRows = (await db.query(
        `
          SELECT TOP (1) specification_id AS specificationId
          FROM specification_co_authors
          WHERE specification_id = @0
            AND hsa_id = @1
        `,
        [spec.id, body.responsibleHsaId],
      )) as Array<{ specificationId: number }>
      if (coAuthorRows.length > 0) {
        throw validationError(
          'Specification lead cannot also be specification co-author',
          { reason: 'specification_lead_cannot_be_co_author' },
        )
      }
    }

    const responsiblePerson =
      body.responsibleHsaId === undefined
        ? undefined
        : await resolveVerifiedRequirementResponsibilityPerson(
            db,
            body.responsibleHsaId,
          )
    const updated = await updateSpecification(db, spec.id, {
      ...body,
      ...(body.responsibleHsaId === undefined ? {} : { responsiblePerson }),
    })
    return NextResponse.json(updated)
  },
})

export const DELETE = secureMutationRoute({
  paramsSchema: specificationParamSchema,
  policy: customMutationPolicy('specification.delete', () => {}),
  handler: async ({ params }) => {
    const { id } = params
    const db = await getRequestSqlServerDataSource()
    const spec = await resolveSpecification(db, id)
    if (!spec) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    await deleteSpecification(db, spec.id)
    return NextResponse.json({ ok: true })
  },
})
