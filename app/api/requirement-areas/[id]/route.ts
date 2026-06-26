import { NextResponse } from 'next/server'
import { z } from 'zod'
import {
  recordAdminPrivilegedActionSucceeded,
  recordDelegatedPrivilegedActionSucceeded,
} from '@/lib/admin/privileged-audit'
import { isHsaId } from '@/lib/auth/hsa-id'
import {
  canAuthorArea,
  canManageAreaCoAuthors,
  deleteArea,
  getAreaById,
  updateAreaWithOwnerCheck,
} from '@/lib/dal/requirement-areas'
import { getRequestSqlServerDataSource } from '@/lib/db'
import {
  adminMutationPolicy,
  customMutationPolicy,
  secureMutationRoute,
} from '@/lib/http/secure-mutation-route'
import {
  boundedDbStringSchema,
  idParamSchema,
  optionalBusinessTextSchema,
  parseRouteParams,
} from '@/lib/http/validation'
import { createRequestContext } from '@/lib/requirements/auth'
import { forbiddenError } from '@/lib/requirements/errors'
import { resolveVerifiedRequirementResponsibilityPerson } from '@/lib/requirements/responsibility-person-verification'

export const dynamic = 'force-dynamic'

type Params = Promise<{ id: string }>

const hsaIdSchema = boundedDbStringSchema.refine(isHsaId, {
  message:
    'HSA-id must use format <two-letter country code><10-digit org no>-<alphanumeric suffix>.',
})

const updateAreaSchema = z
  .object({
    description: optionalBusinessTextSchema,
    name: boundedDbStringSchema.optional(),
    ownerHsaId: hsaIdSchema.optional(),
    prefix: boundedDbStringSchema.optional(),
  })
  .strict()

function isAdmin(roles: readonly string[]): boolean {
  return roles.includes('Admin')
}

export async function GET(request: Request, { params }: { params: Params }) {
  const parsedParams = await parseRouteParams(params, idParamSchema)
  if (!parsedParams.ok) return parsedParams.response
  const { id } = parsedParams.data
  const db = await getRequestSqlServerDataSource()
  const context = await createRequestContext(request, 'rest')
  const area = await getAreaById(db, id)
  if (!area) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const actorIsAdmin = isAdmin(context.actor.roles)
  const [canAuthor, canManageAssignments] = await Promise.all([
    canAuthorArea(db, id, context.actor.hsaId, actorIsAdmin),
    canManageAreaCoAuthors(db, id, context.actor.hsaId, actorIsAdmin),
  ])

  return NextResponse.json({
    area: {
      ...area,
      permissions: {
        canAuthor,
        canManageAssignments,
      },
    },
  })
}

export const PUT = secureMutationRoute({
  bodySchema: updateAreaSchema,
  paramsSchema: idParamSchema,
  policy: customMutationPolicy(
    'requirement_area.update',
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
          'Missing requirement area metadata management permission',
          { reason: 'requirement_area_manager_required' },
        )
      }
    },
  ),
  handler: async ({ body, context, params }) => {
    const db = await getRequestSqlServerDataSource()
    const area = await updateAreaWithOwnerCheck(db, params.id, {
      ...body,
      resolveOwnerPerson:
        body.ownerHsaId === undefined
          ? undefined
          : (executor, ownerHsaId) =>
              resolveVerifiedRequirementResponsibilityPerson(
                executor,
                ownerHsaId,
              ),
    })
    if (!area) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    const auditDetail = {
      changedFields: Object.keys(body),
      operation: 'update',
      resourceId: params.id,
      resourceType: 'requirement_area',
    } as const
    if (isAdmin(context.actor.roles)) {
      await recordAdminPrivilegedActionSucceeded(context, auditDetail)
    } else {
      await recordDelegatedPrivilegedActionSucceeded(context, {
        ...auditDetail,
        actorRole: 'delegated_area_manager',
      })
    }
    return NextResponse.json(area)
  },
})

export const DELETE = secureMutationRoute({
  paramsSchema: idParamSchema,
  policy: adminMutationPolicy(),
  handler: async ({ context, params }) => {
    const db = await getRequestSqlServerDataSource()
    const deletedCount = await deleteArea(db, params.id)
    if (deletedCount === 0) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    await recordAdminPrivilegedActionSucceeded(context, {
      operation: 'delete',
      resourceId: params.id,
      resourceType: 'requirement_area',
    })
    return NextResponse.json({ ok: true })
  },
})
