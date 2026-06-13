import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { HSA_ID_MAX_LENGTH, isHsaId } from '@/lib/auth/hsa-id'
import {
  canManageSpecificationAssignments,
  getSpecificationById,
  getSpecificationBySlug,
  listSpecificationCoAuthors,
  replaceSpecificationCoAuthors,
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
  createRequestContext,
  type RequestContext,
} from '@/lib/requirements/auth'
import { forbiddenError } from '@/lib/requirements/errors'
import { toHttpErrorPayload } from '@/lib/requirements/http-errors'
import { resolveVerifiedRequirementResponsibilityPeople } from '@/lib/requirements/responsibility-person-verification'

export const dynamic = 'force-dynamic'

const specificationParamSchema = z
  .object({
    id: specificationIdOrSlugSchema,
  })
  .strict()

const hsaIdSchema = z.string().trim().max(HSA_ID_MAX_LENGTH).refine(isHsaId, {
  message:
    'Expected HSA-id format <two-letter country code><10-digit org no>-<alphanumeric suffix>',
})

const updateSpecificationCoAuthorsSchema = z
  .object({
    coAuthorHsaIds: z.array(hsaIdSchema),
  })
  .strict()

async function resolveSpecification(db: SqlServerDatabase, idOrSlug: string) {
  if (/^\d+$/.test(idOrSlug)) return getSpecificationById(db, Number(idOrSlug))
  return getSpecificationBySlug(db, idOrSlug)
}

function isAdmin(roles: readonly string[]): boolean {
  return roles.includes('Admin')
}

function assignmentActor(context: RequestContext) {
  return {
    displayName:
      context.actor.displayName.trim() ||
      context.actor.id ||
      context.actor.hsaId,
    hsaId: context.actor.hsaId,
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const parsedParams = await parseRouteParams(params, specificationParamSchema)
  if (!parsedParams.ok) {
    return parsedParams.response
  }

  try {
    const db = await getRequestSqlServerDataSource()
    const context = await createRequestContext(request, 'rest')
    const spec = await resolveSpecification(db, parsedParams.data.id)
    if (!spec) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const allowed = await canManageSpecificationAssignments(
      db,
      spec.id,
      context.actor.hsaId,
      isAdmin(context.actor.roles),
    )
    if (!allowed) {
      throw forbiddenError(
        'Missing specification assignment management permission',
        { reason: 'specification_assignment_manager_required' },
      )
    }

    return NextResponse.json({
      coAuthors: await listSpecificationCoAuthors(db, spec.id),
    })
  } catch (error) {
    const { body, status } = toHttpErrorPayload(error)
    return NextResponse.json(body, { status })
  }
}

export const PUT = secureMutationRoute({
  bodySchema: updateSpecificationCoAuthorsSchema,
  paramsSchema: specificationParamSchema,
  policy: customMutationPolicy(
    'specification.co_authors.update',
    async ({ context, params }) => {
      const db = await getRequestSqlServerDataSource()
      const { id } = params as z.infer<typeof specificationParamSchema>
      const spec = await resolveSpecification(db, id)
      if (!spec) return

      const allowed = await canManageSpecificationAssignments(
        db,
        spec.id,
        context.actor.hsaId,
        isAdmin(context.actor.roles),
      )
      if (!allowed) {
        throw forbiddenError(
          'Missing specification assignment management permission',
          { reason: 'specification_assignment_manager_required' },
        )
      }
    },
  ),
  handler: async ({ body, context, params }) => {
    const db = await getRequestSqlServerDataSource()
    const spec = await resolveSpecification(db, params.id)
    if (!spec) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const coAuthorPeople = await resolveVerifiedRequirementResponsibilityPeople(
      db,
      body.coAuthorHsaIds,
    )
    const result = await replaceSpecificationCoAuthors(db, spec.id, {
      changedBy: assignmentActor(context),
      coAuthorHsaIds: body.coAuthorHsaIds,
      coAuthorPeople,
    })
    if (!result) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    return NextResponse.json(result)
  },
})
