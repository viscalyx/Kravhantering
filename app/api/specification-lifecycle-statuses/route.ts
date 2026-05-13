import { NextResponse } from 'next/server'
import { z } from 'zod'
import {
  createAdminPrivilegedAuditContext,
  recordAdminPrivilegedActionSucceeded,
} from '@/lib/admin/privileged-audit'
import {
  createSpecificationLifecycleStatus,
  listSpecificationLifecycleStatuses,
} from '@/lib/dal/specification-lifecycle-statuses'
import { getRequestSqlServerDataSource } from '@/lib/db'
import {
  boundedDbStringSchema,
  readJsonWithSchema,
} from '@/lib/http/validation'

const lifecycleStatusSchema = z
  .object({
    nameEn: boundedDbStringSchema,
    nameSv: boundedDbStringSchema,
  })
  .strict()

export async function GET() {
  const db = await getRequestSqlServerDataSource()
  const statuses = await listSpecificationLifecycleStatuses(db)
  return NextResponse.json({ statuses })
}

export async function POST(request: Request) {
  const parsedBody = await readJsonWithSchema(request, lifecycleStatusSchema)
  if (!parsedBody.ok) return parsedBody.response
  const auditContext = await createAdminPrivilegedAuditContext(request)
  const db = await getRequestSqlServerDataSource()
  const status = await createSpecificationLifecycleStatus(db, parsedBody.data)
  recordAdminPrivilegedActionSucceeded(auditContext, {
    changedFields: Object.keys(parsedBody.data),
    operation: 'create',
    resourceId: status.id,
    resourceType: 'specification_lifecycle_status',
  })
  return NextResponse.json(status, { status: 201 })
}
