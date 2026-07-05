import { NextResponse } from 'next/server'
import { z } from 'zod'
import { HSA_ID_MAX_LENGTH, isHsaId } from '@/lib/auth/hsa-id'
import {
  canManageSpecificationAssignments,
  getSpecificationById,
  updateSpecificationResponsible,
} from '@/lib/dal/requirements-specifications'
import { getRequestSqlServerDataSource } from '@/lib/db'
import {
  customMutationPolicy,
  secureMutationRoute,
} from '@/lib/http/secure-mutation-route'
import { idParamSchema } from '@/lib/http/validation'
import { forbiddenError } from '@/lib/requirements/errors'
import { resolveVerifiedRequirementResponsibilityPerson } from '@/lib/requirements/responsibility-person-verification'

export const dynamic = 'force-dynamic'

const specificationParamSchema = idParamSchema

const hsaIdSchema = z.string().trim().max(HSA_ID_MAX_LENGTH).refine(isHsaId, {
  message:
    'Expected HSA-id format <two-letter country code><10-digit org no>-<alphanumeric suffix>',
})

const updateSpecificationResponsibleSchema = z
  .object({
    responsibleHsaId: hsaIdSchema,
  })
  .strict()

function isAdmin(roles: readonly string[]): boolean {
  return roles.includes('Admin')
}

export const PUT = secureMutationRoute({
  bodySchema: updateSpecificationResponsibleSchema,
  paramsSchema: specificationParamSchema,
  policy: customMutationPolicy(
    'specification.responsible.update',
    async ({ context, params }) => {
      const db = await getRequestSqlServerDataSource()
      const { id } = params as z.infer<typeof specificationParamSchema>
      const spec = await getSpecificationById(db, id)
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
  handler: async ({ body, params }) => {
    const db = await getRequestSqlServerDataSource()
    const spec = await getSpecificationById(db, params.id)
    if (!spec) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const responsiblePerson =
      await resolveVerifiedRequirementResponsibilityPerson(
        db,
        body.responsibleHsaId,
      )
    const updated = await updateSpecificationResponsible(db, spec.id, {
      responsibleHsaId: body.responsibleHsaId,
      responsiblePerson,
    })
    if (!updated) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    return NextResponse.json(updated)
  },
})
