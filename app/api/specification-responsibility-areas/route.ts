import { NextResponse } from 'next/server'
import { z } from 'zod'
import { recordAdminPrivilegedActionSucceeded } from '@/lib/admin/privileged-audit'
import {
  createSpecificationResponsibilityArea,
  listSpecificationResponsibilityAreas,
} from '@/lib/dal/specification-responsibility-areas'
import { getRequestSqlServerDataSource } from '@/lib/db'
import {
  adminMutationPolicy,
  secureMutationRoute,
} from '@/lib/http/secure-mutation-route'
import { boundedDbStringSchema } from '@/lib/http/validation'

const responsibilityAreaSchema = z
  .object({
    nameEn: boundedDbStringSchema,
    nameSv: boundedDbStringSchema,
  })
  .strict()

export async function GET() {
  const db = await getRequestSqlServerDataSource()
  const areas = await listSpecificationResponsibilityAreas(db)
  return NextResponse.json({ areas })
}

export const POST = secureMutationRoute({
  bodySchema: responsibilityAreaSchema,
  policy: adminMutationPolicy(),
  handler: async ({ body, context }) => {
    const db = await getRequestSqlServerDataSource()
    const area = await createSpecificationResponsibilityArea(db, body)
    await recordAdminPrivilegedActionSucceeded(context, {
      changedFields: Object.keys(body),
      operation: 'create',
      resourceId: area.id,
      resourceType: 'specification_responsibility_area',
    })
    return NextResponse.json(area, { status: 201 })
  },
})
