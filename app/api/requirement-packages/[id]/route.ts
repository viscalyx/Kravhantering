import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { recordAllowedActionAuditEvent } from '@/lib/audit/action-audit'
import { isHsaId } from '@/lib/auth/hsa-id'
import {
  deleteRequirementPackage,
  getLinkedRequirementsForPackage,
  getRequirementPackageById,
  getRequirementPackageUsage,
  updateRequirementPackage,
} from '@/lib/dal/requirement-packages'
import { getRequestSqlServerDataSource } from '@/lib/db'
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

export const dynamic = 'force-dynamic'

type Params = Promise<{ id: string }>

const updateRequirementPackageSchema = z
  .object({
    description: optionalBusinessTextSchema,
    leadDisplayName: boundedDbStringSchema.optional(),
    leadHsaId: boundedDbStringSchema
      .refine(isHsaId, {
        message: 'Expected a valid HSA-ID',
      })
      .optional(),
    name: boundedDbStringSchema.optional(),
  })
  .strict()

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
      descriptionEn: requirementPackage.description,
      descriptionSv: requirementPackage.description,
      nameEn: requirementPackage.name,
      nameSv: requirementPackage.name,
      owner: null,
      ownerId: null,
    },
    linkedRequirements,
  })
}

export const PUT = secureMutationRoute({
  bodySchema: updateRequirementPackageSchema,
  paramsSchema: idParamSchema,
  policy: customMutationPolicy('requirement_package', () => {}),
  handler: async ({ body, context, params }) => {
    const db = await getRequestSqlServerDataSource()
    const requirementPackage = await updateRequirementPackage(
      db,
      params.id,
      body,
    )
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
  policy: customMutationPolicy('requirement_package', () => {}),
  handler: async ({ context, params }) => {
    const db = await getRequestSqlServerDataSource()
    const deletedCount = await deleteRequirementPackage(db, params.id)
    if (deletedCount === 0) {
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
    return NextResponse.json({ ok: true })
  },
})
