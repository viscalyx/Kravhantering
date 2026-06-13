import { NextResponse } from 'next/server'
import { z } from 'zod'
import { isHsaId } from '@/lib/auth/hsa-id'
import { canManageAreaCoAuthors } from '@/lib/dal/requirement-areas'
import { canManageSpecificationAssignments } from '@/lib/dal/requirements-specifications'
import { getRequestSqlServerDataSource } from '@/lib/db'
import {
  customMutationPolicy,
  secureMutationRoute,
} from '@/lib/http/secure-mutation-route'
import {
  boundedDbStringSchema,
  positiveIntegerSchema,
} from '@/lib/http/validation'
import { forbiddenError } from '@/lib/requirements/errors'
import {
  requireRequirementPackageCreatePermission,
  requireRequirementPackageLeadOrAdmin,
} from '@/lib/requirements/requirement-package-permissions'
import {
  toRequirementResponsibilityPersonVerificationPayload,
  verifyRequirementResponsibilityPerson,
} from '@/lib/requirements/responsibility-person-verification'

const verifyPurposeSchema = z.enum([
  'requirement_area_owner',
  'requirement_area_co_author',
  'requirement_package_co_author',
  'requirement_package_lead',
  'requirements_specification_responsible',
  'requirements_specification_co_author',
])

const verifyModeSchema = z.enum(['reuse_local', 'refresh'])

const verifySchema = z
  .object({
    hsaId: boundedDbStringSchema.refine(isHsaId, {
      message: 'Expected a valid HSA-id',
    }),
    mode: verifyModeSchema,
    purpose: verifyPurposeSchema,
    scopeId: positiveIntegerSchema.optional(),
  })
  .strict()

function isAdmin(roles: string[]): boolean {
  return roles.includes('Admin')
}

export const POST = secureMutationRoute({
  bodySchema: verifySchema,
  policy: customMutationPolicy<z.infer<typeof verifySchema>>(
    'requirement_responsibility_person.verify',
    async ({ body, context }) => {
      let db: Awaited<ReturnType<typeof getRequestSqlServerDataSource>> | null =
        null
      const getDb = async () => {
        db ??= await getRequestSqlServerDataSource()
        return db
      }

      if (body.purpose === 'requirement_area_owner') {
        if (context.actor.roles.includes('Admin')) {
          return
        }
        if (!body.scopeId) {
          throw forbiddenError('Requirement area scope is required', {
            reason: 'scope_required',
          })
        }
        const allowed = await canManageAreaCoAuthors(
          await getDb(),
          body.scopeId,
          context.actor.hsaId,
          false,
        )
        if (!allowed) {
          throw forbiddenError(
            'Missing requirement area owner management permission',
            { reason: 'requirement_area_owner_manager_required' },
          )
        }
      }

      if (body.purpose === 'requirement_area_co_author') {
        if (!body.scopeId) {
          throw forbiddenError('Requirement area scope is required', {
            reason: 'scope_required',
          })
        }
        const allowed = await canManageAreaCoAuthors(
          await getDb(),
          body.scopeId,
          context.actor.hsaId,
          isAdmin(context.actor.roles),
        )
        if (!allowed) {
          throw forbiddenError(
            'Missing requirement area co-author management permission',
            { reason: 'requirement_area_co_author_manager_required' },
          )
        }
      }

      if (
        body.purpose === 'requirement_package_co_author' ||
        body.purpose === 'requirement_package_lead'
      ) {
        if (body.scopeId) {
          await requireRequirementPackageLeadOrAdmin(
            await getDb(),
            context,
            body.scopeId,
            'requirement_package.update',
          )
        } else {
          await requireRequirementPackageCreatePermission(
            await getDb(),
            context,
          )
        }
      }

      if (
        body.purpose === 'requirements_specification_responsible' ||
        body.purpose === 'requirements_specification_co_author'
      ) {
        if (
          body.purpose === 'requirements_specification_responsible' &&
          !body.scopeId &&
          context.actor.hsaId &&
          body.hsaId === context.actor.hsaId
        ) {
          return
        }
        if (!body.scopeId) {
          throw forbiddenError('Missing specification scope', {
            reason: 'scope_required',
          })
        }
        const allowed = await canManageSpecificationAssignments(
          await getDb(),
          body.scopeId,
          context.actor.hsaId,
          isAdmin(context.actor.roles),
        )
        if (!allowed) {
          throw forbiddenError(
            'Missing specification assignment management permission',
            { reason: 'specification_assignment_manager_required' },
          )
        }
      }
    },
  ),
  handler: async ({ body }) => {
    const db = await getRequestSqlServerDataSource()
    const person = await verifyRequirementResponsibilityPerson(
      db,
      body.hsaId,
      body.mode,
    )
    return NextResponse.json({
      person: toRequirementResponsibilityPersonVerificationPayload(person),
    })
  },
})
