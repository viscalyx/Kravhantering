import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withPrivilegedMutationAudit } from '@/lib/admin/privileged-audit'
import {
  isAiSafetyRuleId,
  restoreAiSafetyRuleDefaults,
} from '@/lib/dal/ai-safety-rules'
import { getRequestSqlServerDataSource } from '@/lib/db'
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
  paramsSchema,
  policy: adminMutationPolicy(),
  handler: async ({ context, params }) => {
    const db = await getRequestSqlServerDataSource()
    const restoredCount = await withPrivilegedMutationAudit(context, audit =>
      restoreAiSafetyRuleDefaults(db, params.ruleId, {
        audit: (executor, restoredCount) =>
          audit(executor, {
            changedFields: ['direction', 'isActive'],
            itemCount: restoredCount,
            operation: 'update',
            resourceId: params.ruleId,
            resourceType: 'ai_safety_rule',
          }),
      }),
    )

    return NextResponse.json({ restoredCount })
  },
})
