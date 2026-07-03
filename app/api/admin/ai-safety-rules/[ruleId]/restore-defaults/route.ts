import { NextResponse } from 'next/server'
import { z } from 'zod'
import { recordAdminPrivilegedActionSucceeded } from '@/lib/admin/privileged-audit'
import {
  isAiSafetyRuleId,
  restoreAiSafetyRuleDefaults,
} from '@/lib/dal/ai-safety-rules'
import { getRequestSqlServerDataSource } from '@/lib/db'
import { noStore } from '@/lib/http/cache-control'
import {
  adminMutationPolicy,
  secureMutationRoute,
} from '@/lib/http/secure-mutation-route'
import { routeSegmentSchema } from '@/lib/http/validation'

const paramsSchema = z
  .object({
    ruleId: routeSegmentSchema.refine(isAiSafetyRuleId, {
      message: 'Expected a known AI safety rule id.',
    }),
  })
  .strict()

export const POST = secureMutationRoute({
  decorateErrorResponse: noStore,
  paramsSchema,
  policy: adminMutationPolicy(),
  handler: async ({ context, params }) => {
    const db = await getRequestSqlServerDataSource()
    const restoredCount = await restoreAiSafetyRuleDefaults(db, params.ruleId)
    await recordAdminPrivilegedActionSucceeded(context, {
      changedFields: ['direction', 'isActive'],
      itemCount: restoredCount,
      operation: 'update',
      resourceId: params.ruleId,
      resourceType: 'ai_safety_rule',
    })
    return noStore(NextResponse.json({ restoredCount }))
  },
})
