import { NextResponse } from 'next/server'
import { z } from 'zod'
import { recordAdminPrivilegedActionSucceeded } from '@/lib/admin/privileged-audit'
import { isHsaId } from '@/lib/auth/hsa-id'
import { deleteArea, updateArea } from '@/lib/dal/requirement-areas'
import { getRequestSqlServerDataSource } from '@/lib/db'
import {
  adminMutationPolicy,
  secureMutationRoute,
} from '@/lib/http/secure-mutation-route'
import {
  boundedDbStringSchema,
  idParamSchema,
  optionalBusinessTextSchema,
} from '@/lib/http/validation'
import { validationError } from '@/lib/requirements/errors'
import { resolveVerifiedRequirementResponsibilityPerson } from '@/lib/requirements/responsibility-person-verification'

export const dynamic = 'force-dynamic'

const hsaIdSchema = boundedDbStringSchema.refine(isHsaId, {
  message:
    'HSA-ID must use format <two-letter country code><10-digit org no>-<alphanumeric suffix>.',
})

const updateAreaSchema = z
  .object({
    description: optionalBusinessTextSchema,
    name: boundedDbStringSchema.optional(),
    ownerHsaId: hsaIdSchema.optional(),
  })
  .strict()

export const PUT = secureMutationRoute({
  bodySchema: updateAreaSchema,
  paramsSchema: idParamSchema,
  policy: adminMutationPolicy(),
  handler: async ({ body, context, params }) => {
    const db = await getRequestSqlServerDataSource()
    if (body.ownerHsaId !== undefined) {
      const coAuthorRows = (await db.query(
        `
          SELECT TOP (1) area_id AS areaId
          FROM requirement_area_co_authors
          WHERE area_id = @0
            AND hsa_id = @1
        `,
        [params.id, body.ownerHsaId],
      )) as Array<{ areaId: number }>
      if (coAuthorRows.length > 0) {
        throw validationError(
          'Requirement area owner cannot also be requirement area co-author',
          { reason: 'area_owner_cannot_be_co_author' },
        )
      }
    }
    const ownerPerson =
      body.ownerHsaId === undefined
        ? undefined
        : await resolveVerifiedRequirementResponsibilityPerson(
            db,
            body.ownerHsaId,
          )
    const area = await updateArea(db, params.id, { ...body, ownerPerson })
    if (!area) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    await recordAdminPrivilegedActionSucceeded(context, {
      changedFields: Object.keys(body),
      operation: 'update',
      resourceId: params.id,
      resourceType: 'requirement_area',
    })
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
