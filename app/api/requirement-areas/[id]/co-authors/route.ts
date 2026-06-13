import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { HSA_ID_MAX_LENGTH, isHsaId } from '@/lib/auth/hsa-id'
import {
  canManageAreaCoAuthors,
  getAreaById,
  listRequirementAreaCoAuthors,
  replaceRequirementAreaCoAuthors,
} from '@/lib/dal/requirement-areas'
import { getRequestSqlServerDataSource } from '@/lib/db'
import {
  customMutationPolicy,
  secureMutationRoute,
} from '@/lib/http/secure-mutation-route'
import { idParamSchema, parseRouteParams } from '@/lib/http/validation'
import {
  createRequestContext,
  type RequestContext,
} from '@/lib/requirements/auth'
import { forbiddenError } from '@/lib/requirements/errors'
import { toHttpErrorPayload } from '@/lib/requirements/http-errors'
import { resolveVerifiedRequirementResponsibilityPeople } from '@/lib/requirements/responsibility-person-verification'

export const dynamic = 'force-dynamic'

const hsaIdSchema = z.string().trim().max(HSA_ID_MAX_LENGTH).refine(isHsaId, {
  message:
    'Expected HSA-id format <two-letter country code><10-digit org no>-<alphanumeric suffix>',
})

const updateRequirementAreaCoAuthorsSchema = z
  .object({
    coAuthorHsaIds: z.array(hsaIdSchema),
  })
  .strict()

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
  const parsedParams = await parseRouteParams(params, idParamSchema)
  if (!parsedParams.ok) {
    return parsedParams.response
  }

  try {
    const db = await getRequestSqlServerDataSource()
    const context = await createRequestContext(request, 'rest')
    const area = await getAreaById(db, parsedParams.data.id)
    if (!area) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const allowed = await canManageAreaCoAuthors(
      db,
      parsedParams.data.id,
      context.actor.hsaId,
      isAdmin(context.actor.roles),
    )
    if (!allowed) {
      throw forbiddenError(
        'Missing requirement area co-author management permission',
        { reason: 'requirement_area_co_author_manager_required' },
      )
    }

    return NextResponse.json({
      coAuthors: await listRequirementAreaCoAuthors(db, parsedParams.data.id),
    })
  } catch (error) {
    const { body, status } = toHttpErrorPayload(error)
    return NextResponse.json(body, { status })
  }
}

export const PUT = secureMutationRoute({
  bodySchema: updateRequirementAreaCoAuthorsSchema,
  paramsSchema: idParamSchema,
  policy: customMutationPolicy(
    'requirement_area.co_authors.update',
    async ({ context, params }) => {
      const db = await getRequestSqlServerDataSource()
      const { id } = params as z.infer<typeof idParamSchema>
      const area = await getAreaById(db, id)
      if (!area) return

      const allowed = await canManageAreaCoAuthors(
        db,
        id,
        context.actor.hsaId,
        isAdmin(context.actor.roles),
      )
      if (!allowed) {
        throw forbiddenError(
          'Missing requirement area co-author management permission',
          { reason: 'requirement_area_co_author_manager_required' },
        )
      }
    },
  ),
  handler: async ({ body, context, params }) => {
    const db = await getRequestSqlServerDataSource()
    const area = await getAreaById(db, params.id)
    if (!area) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const coAuthorPeople = await resolveVerifiedRequirementResponsibilityPeople(
      db,
      body.coAuthorHsaIds,
    )
    const result = await replaceRequirementAreaCoAuthors(db, params.id, {
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
