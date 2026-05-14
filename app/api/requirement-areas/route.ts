import { NextResponse } from 'next/server'
import { z } from 'zod'
import { recordAdminPrivilegedActionSucceeded } from '@/lib/admin/privileged-audit'
import { listOwners, type Owner } from '@/lib/dal/owners'
import {
  createArea,
  listAreas,
  type RequirementAreaRow,
} from '@/lib/dal/requirement-areas'
import { getRequestSqlServerDataSource } from '@/lib/db'
import {
  adminMutationPolicy,
  secureMutationRoute,
} from '@/lib/http/secure-mutation-route'
import {
  boundedDbStringSchema,
  optionalBusinessTextSchema,
  positiveIntegerSchema,
} from '@/lib/http/validation'

const optionalOwnerIdSchema = positiveIntegerSchema
  .nullable()
  .optional()
  .transform(value => value ?? undefined)

const createAreaSchema = z
  .object({
    description: optionalBusinessTextSchema,
    name: boundedDbStringSchema,
    ownerId: optionalOwnerIdSchema,
    prefix: boundedDbStringSchema,
  })
  .strict()

export async function GET() {
  const db = await getRequestSqlServerDataSource()
  const [areas, owners] = await Promise.all([listAreas(db), listOwners(db)])
  const ownerMap = new Map(
    owners.map((owner: Owner) => [
      owner.id,
      `${owner.firstName} ${owner.lastName}`,
    ]),
  )
  const enriched = areas.map((area: RequirementAreaRow) => ({
    ...area,
    ownerName: area.ownerId ? (ownerMap.get(area.ownerId) ?? null) : null,
  }))
  return NextResponse.json({ areas: enriched })
}

export const POST = secureMutationRoute({
  bodySchema: createAreaSchema,
  policy: adminMutationPolicy(),
  handler: async ({ body, context }) => {
    const db = await getRequestSqlServerDataSource()
    const area = await createArea(db, body)
    recordAdminPrivilegedActionSucceeded(context, {
      changedFields: Object.keys(body),
      operation: 'create',
      resourceId: area.id,
      resourceType: 'requirement_area',
    })
    return NextResponse.json(area, { status: 201 })
  },
})
