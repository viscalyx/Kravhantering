import { NextResponse } from 'next/server'
import { z } from 'zod'
import {
  createAdminPrivilegedAuditContext,
  recordAdminPrivilegedActionSucceeded,
} from '@/lib/admin/privileged-audit'
import { isHsaId } from '@/lib/auth/hsa-id'
import { createOwner, listOwners } from '@/lib/dal/owners'
import { getRequestSqlServerDataSource } from '@/lib/db'
import {
  boundedDbStringSchema,
  readJsonWithSchema,
} from '@/lib/http/validation'

const ownerCreateSchema = z
  .object({
    email: boundedDbStringSchema.nullable().optional(),
    firstName: boundedDbStringSchema,
    hsaId: boundedDbStringSchema.refine(isHsaId, {
      message:
        'HSA-ID must use format SE<10-digit org no>-<alphanumeric suffix>.',
    }),
    lastName: boundedDbStringSchema,
  })
  .strict()

export async function GET() {
  const db = await getRequestSqlServerDataSource()
  const ownersList = await listOwners(db)
  return NextResponse.json({
    owners: ownersList.map(o => ({
      hsaId: o.hsaId,
      id: o.id,
      name: `${o.firstName} ${o.lastName}`,
    })),
  })
}

export async function POST(request: Request) {
  const parsedBody = await readJsonWithSchema(request, ownerCreateSchema)
  if (!parsedBody.ok) return parsedBody.response
  const auditContext = await createAdminPrivilegedAuditContext(request)
  const db = await getRequestSqlServerDataSource()
  const owner = await createOwner(db, {
    ...parsedBody.data,
    email: parsedBody.data.email ?? null,
  })
  recordAdminPrivilegedActionSucceeded(auditContext, {
    changedFields: Object.keys(parsedBody.data),
    operation: 'create',
    resourceId: owner.id,
    resourceType: 'owner',
  })
  return NextResponse.json(owner, { status: 201 })
}
