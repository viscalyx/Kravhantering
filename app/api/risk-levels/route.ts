import { NextResponse } from 'next/server'
import { z } from 'zod'
import { recordAdminPrivilegedActionSucceeded } from '@/lib/admin/privileged-audit'
import {
  countLinkedRequirements,
  createRiskLevel,
  listRiskLevels,
} from '@/lib/dal/risk-levels'
import { getRequestSqlServerDataSource } from '@/lib/db'
import {
  INTERNAL_SERVER_ERROR_MESSAGE,
  isDuplicateKeyError,
  logSanitizedError,
} from '@/lib/http/safe-errors'
import {
  adminMutationPolicy,
  secureMutationRoute,
} from '@/lib/http/secure-mutation-route'
import {
  boundedDbStringSchema,
  nonNegativeIntegerSchema,
} from '@/lib/http/validation'

const createRiskLevelSchema = z
  .object({
    color: boundedDbStringSchema,
    nameEn: boundedDbStringSchema,
    nameSv: boundedDbStringSchema,
    sortOrder: nonNegativeIntegerSchema.optional(),
  })
  .strict()

export async function GET() {
  const db = await getRequestSqlServerDataSource()
  const [riskLevels, counts] = await Promise.all([
    listRiskLevels(db),
    countLinkedRequirements(db),
  ])
  return NextResponse.json({
    riskLevels: riskLevels.map(r => ({
      ...r,
      linkedRequirementCount: counts[r.id] ?? 0,
    })),
  })
}

export const POST = secureMutationRoute({
  bodySchema: createRiskLevelSchema,
  policy: adminMutationPolicy(),
  handler: async ({ body, context }) => {
    try {
      const db = await getRequestSqlServerDataSource()
      const riskLevel = await createRiskLevel(db, body)
      await recordAdminPrivilegedActionSucceeded(context, {
        changedFields: Object.keys(body),
        operation: 'create',
        resourceId: riskLevel.id,
        resourceType: 'risk_level',
      })
      return NextResponse.json(riskLevel, { status: 201 })
    } catch (error) {
      const isDuplicate = isDuplicateKeyError(error)
      if (!isDuplicate) {
        logSanitizedError('Failed to create risk level', error)
      }
      return NextResponse.json(
        {
          error: isDuplicate
            ? 'Duplicate entry'
            : INTERNAL_SERVER_ERROR_MESSAGE,
        },
        { status: isDuplicate ? 409 : 500 },
      )
    }
  },
})
