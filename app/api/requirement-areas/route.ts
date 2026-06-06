import { NextResponse } from 'next/server'
import { z } from 'zod'
import { recordAdminPrivilegedActionSucceeded } from '@/lib/admin/privileged-audit'
import { isHsaId } from '@/lib/auth/hsa-id'
import { createArea, listAreas } from '@/lib/dal/requirement-areas'
import { getRequestSqlServerDataSource } from '@/lib/db'
import {
  adminMutationPolicy,
  secureMutationRoute,
} from '@/lib/http/secure-mutation-route'
import {
  boundedDbStringSchema,
  optionalBusinessTextSchema,
} from '@/lib/http/validation'

const hsaIdSchema = boundedDbStringSchema.refine(isHsaId, {
  message:
    'HSA-ID must use format <two-letter country code><10-digit org no>-<alphanumeric suffix>.',
})

const createAreaSchema = z
  .object({
    description: optionalBusinessTextSchema,
    name: boundedDbStringSchema,
    ownerHsaId: hsaIdSchema,
    prefix: boundedDbStringSchema,
  })
  .strict()

export async function GET() {
  const db = await getRequestSqlServerDataSource()
  const areas = await listAreas(db)
  return NextResponse.json({ areas })
}

export const POST = secureMutationRoute({
  bodySchema: createAreaSchema,
  policy: adminMutationPolicy(),
  handler: async ({ body, context }) => {
    const db = await getRequestSqlServerDataSource()
    const area = await createArea(db, body)
    await recordAdminPrivilegedActionSucceeded(context, {
      changedFields: Object.keys(body),
      operation: 'create',
      resourceId: area.id,
      resourceType: 'requirement_area',
    })
    return NextResponse.json(area, { status: 201 })
  },
})
