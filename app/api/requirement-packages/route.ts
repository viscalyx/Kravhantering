import { NextResponse } from 'next/server'
import { z } from 'zod'
import {
  createAdminPrivilegedAuditContext,
  recordAdminPrivilegedActionSucceeded,
} from '@/lib/admin/privileged-audit'
import {
  countLinkedRequirementsByPackage,
  createRequirementPackage,
  listRequirementPackages,
} from '@/lib/dal/requirement-packages'
import { getRequestSqlServerDataSource } from '@/lib/db'
import {
  boundedDbStringSchema,
  optionalBusinessTextSchema,
  positiveIntegerSchema,
  readJsonWithSchema,
} from '@/lib/http/validation'

const requirementPackageSchema = z
  .object({
    descriptionEn: optionalBusinessTextSchema,
    descriptionSv: optionalBusinessTextSchema,
    nameEn: boundedDbStringSchema,
    nameSv: boundedDbStringSchema,
    ownerId: positiveIntegerSchema.nullable().optional(),
  })
  .strict()

export async function GET() {
  const db = await getRequestSqlServerDataSource()
  const [requirementPackages, counts] = await Promise.all([
    listRequirementPackages(db),
    countLinkedRequirementsByPackage(db),
  ])
  return NextResponse.json({
    requirementPackages: requirementPackages.map(s => ({
      ...s,
      linkedRequirementCount: counts[s.id] ?? 0,
    })),
  })
}

export async function POST(request: Request) {
  const parsedBody = await readJsonWithSchema(request, requirementPackageSchema)
  if (!parsedBody.ok) return parsedBody.response
  const auditContext = await createAdminPrivilegedAuditContext(request)
  const db = await getRequestSqlServerDataSource()
  const requirementPackage = await createRequirementPackage(db, parsedBody.data)
  recordAdminPrivilegedActionSucceeded(auditContext, {
    changedFields: Object.keys(parsedBody.data),
    operation: 'create',
    resourceId: requirementPackage.id,
    resourceType: 'requirement_package',
  })
  return NextResponse.json(requirementPackage, { status: 201 })
}
