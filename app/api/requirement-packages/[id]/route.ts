import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { recordAllowedActionAuditEvent } from '@/lib/audit/action-audit'
import { recordRequirementSelectionCleanupAudit } from '@/lib/audit/requirement-selection-cleanup-audit'
import { isHsaId } from '@/lib/auth/hsa-id'
import {
  deleteRequirementPackage,
  getLinkedRequirementsForPackage,
  getRequirementPackageById,
  getRequirementPackageUsage,
  updateRequirementPackage,
} from '@/lib/dal/requirement-packages'
import { getRequestSqlServerDataSource } from '@/lib/db'
import { logSanitizedError } from '@/lib/http/safe-errors'
import {
  customMutationPolicy,
  secureMutationRoute,
} from '@/lib/http/secure-mutation-route'
import {
  boundedDbStringSchema,
  idParamSchema,
  optionalBusinessTextSchema,
  parseRouteParams,
} from '@/lib/http/validation'
import { validationError } from '@/lib/requirements/errors'
import {
  requireRequirementPackageLeadOrAdmin,
  requireRequirementPackagePermission,
} from '@/lib/requirements/requirement-package-permissions'
import { resolveVerifiedRequirementResponsibilityPerson } from '@/lib/requirements/responsibility-person-verification'

export const dynamic = 'force-dynamic'

type Params = Promise<{ id: string }>

const hsaIdSchema = boundedDbStringSchema.refine(isHsaId, {
  message: 'Expected a valid HSA-id',
})

const updateRequirementPackageSchema = z
  .object({
    description: optionalBusinessTextSchema,
    leadHsaId: hsaIdSchema.optional(),
    name: boundedDbStringSchema.optional(),
  })
  .strict()
  .refine(
    body =>
      ['description', 'leadHsaId', 'name'].some(key =>
        Object.hasOwn(body, key),
      ),
    { message: 'At least one field must be provided for update' },
  )

export async function GET(
  _request: NextRequest,
  { params }: { params: Params },
) {
  const parsedParams = await parseRouteParams(params, idParamSchema)
  if (!parsedParams.ok) return parsedParams.response
  const { id } = parsedParams.data
  const db = await getRequestSqlServerDataSource()
  const [requirementPackage, linkedRequirements] = await Promise.all([
    getRequirementPackageById(db, id),
    getLinkedRequirementsForPackage(db, id),
  ])
  if (!requirementPackage) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  return NextResponse.json({
    requirementPackage: {
      ...requirementPackage,
      owner: null,
      ownerId: null,
    },
    linkedRequirements,
  })
}

export const PUT = secureMutationRoute({
  bodySchema: updateRequirementPackageSchema,
  paramsSchema: idParamSchema,
  policy: customMutationPolicy<
    z.infer<typeof updateRequirementPackageSchema>,
    z.infer<typeof idParamSchema>
  >('requirement_package.update', async ({ context, params }) => {
    const db = await getRequestSqlServerDataSource()
    await requireRequirementPackageLeadOrAdmin(
      db,
      context,
      params.id,
      'requirement_package.update',
    )
  }),
  handler: async ({ body, context, params }) => {
    const db = await getRequestSqlServerDataSource()
    const existing = await getRequirementPackageById(db, params.id)
    if (!existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    const nextLeadHsaId = body.leadHsaId ?? existing.leadHsaId
    const existingCoAuthorIds =
      existing.coAuthors?.map(coAuthor => coAuthor.hsaId) ?? []
    if (existingCoAuthorIds.includes(nextLeadHsaId)) {
      throw validationError('Package lead cannot also be package co-author', {
        reason: 'package_lead_cannot_be_co_author',
      })
    }
    const leadPerson =
      body.leadHsaId === undefined
        ? undefined
        : await resolveVerifiedRequirementResponsibilityPerson(
            db,
            body.leadHsaId,
          )
    const requirementPackage = await updateRequirementPackage(db, params.id, {
      ...body,
      leadPerson,
    })
    if (!requirementPackage) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    await recordAllowedActionAuditEvent(db, context, {
      action: 'requirement_package.update',
      details: { changedFields: Object.keys(body) },
      targetId: params.id,
      targetKind: 'requirement_package',
    })
    return NextResponse.json(requirementPackage)
  },
})

export const DELETE = secureMutationRoute({
  paramsSchema: idParamSchema,
  policy: customMutationPolicy('requirement_package.delete', ({ context }) => {
    requireRequirementPackagePermission(context, 'requirement_package.delete')
  }),
  handler: async ({ context, params }) => {
    const db = await getRequestSqlServerDataSource()
    const result = await deleteRequirementPackage(db, params.id)
    if (result.deletedCount === 0) {
      const existing = await getRequirementPackageById(db, params.id)
      if (existing) {
        const usage = await getRequirementPackageUsage(db, params.id)
        return NextResponse.json(
          {
            error: 'Requirement package is in use',
            usage,
          },
          { status: 409 },
        )
      }
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    await recordAllowedActionAuditEvent(db, context, {
      action: 'requirement_package.delete',
      targetId: params.id,
      targetKind: 'requirement_package',
    })
    const originAction = 'requirement_package.delete'
    try {
      await recordRequirementSelectionCleanupAudit(db, context, {
        cleanup: result.cleanup,
        originAction,
        originTargetId: params.id,
        originTargetKind: 'requirement_package',
      })
    } catch (error) {
      logSanitizedError(
        'Failed to record requirement-selection cleanup audit after package deletion',
        error,
        {
          originAction,
          originTargetId: params.id,
          originTargetKind: 'requirement_package',
        },
      )
    }
    return NextResponse.json({ ok: true })
  },
})
