import { NextResponse } from 'next/server'
import { z } from 'zod'
import { recordAdminPrivilegedActionSucceeded } from '@/lib/admin/privileged-audit'
import { isHsaId } from '@/lib/auth/hsa-id'
import {
  canManageAreaCoAuthors,
  createArea,
  listAreas,
} from '@/lib/dal/requirement-areas'
import { getRequestSqlServerDataSource } from '@/lib/db'
import {
  adminMutationPolicy,
  secureMutationRoute,
} from '@/lib/http/secure-mutation-route'
import {
  boundedDbStringSchema,
  optionalBusinessTextSchema,
} from '@/lib/http/validation'
import { createRequestContext } from '@/lib/requirements/auth'
import { resolveVerifiedRequirementResponsibilityPerson } from '@/lib/requirements/responsibility-person-verification'

const hsaIdSchema = boundedDbStringSchema.refine(isHsaId, {
  message:
    'HSA-id must use format <two-letter country code><10-digit org no>-<alphanumeric suffix>.',
})

const createAreaSchema = z
  .object({
    description: optionalBusinessTextSchema,
    name: boundedDbStringSchema,
    ownerHsaId: hsaIdSchema,
    prefix: boundedDbStringSchema,
  })
  .strict()

export async function GET(
  request: Request = new Request('http://localhost/api/requirement-areas'),
) {
  const db = await getRequestSqlServerDataSource()
  const context = await createRequestContext(request, 'rest')
  const areas = await listAreas(db)
  const isAdmin = context.actor.roles.includes('Admin')
  return NextResponse.json({
    areas: await Promise.all(
      areas.map(async area => ({
        ...area,
        permissions: {
          canManageAssignments: await canManageAreaCoAuthors(
            db,
            area.id,
            context.actor.hsaId,
            isAdmin,
          ),
        },
      })),
    ),
  })
}

export const POST = secureMutationRoute({
  bodySchema: createAreaSchema,
  policy: adminMutationPolicy(),
  handler: async ({ body, context }) => {
    const db = await getRequestSqlServerDataSource()
    const ownerPerson = await resolveVerifiedRequirementResponsibilityPerson(
      db,
      body.ownerHsaId,
    )
    const area = await createArea(db, { ...body, ownerPerson })
    await recordAdminPrivilegedActionSucceeded(context, {
      changedFields: Object.keys(body),
      operation: 'create',
      resourceId: area.id,
      resourceType: 'requirement_area',
    })
    return NextResponse.json(area, { status: 201 })
  },
})
