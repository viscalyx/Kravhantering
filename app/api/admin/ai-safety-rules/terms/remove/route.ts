import { NextResponse } from 'next/server'
import { z } from 'zod'
import { recordAdminPrivilegedActionSucceeded } from '@/lib/admin/privileged-audit'
import { removeAiSafetyRuleTerms } from '@/lib/dal/ai-safety-rules'
import { getRequestSqlServerDataSource } from '@/lib/db'
import {
  adminMutationPolicy,
  secureMutationRoute,
} from '@/lib/http/secure-mutation-route'
import { positiveIntegerSchema } from '@/lib/http/validation'

const removeTermsSchema = z
  .object({
    termIds: z.array(positiveIntegerSchema).min(1).max(100),
  })
  .strict()

function noStore<T extends NextResponse>(response: T): T {
  response.headers.set('Cache-Control', 'no-store')
  return response
}

export const POST = secureMutationRoute({
  bodySchema: removeTermsSchema,
  decorateErrorResponse: noStore,
  policy: adminMutationPolicy(),
  handler: async ({ body, context }) => {
    const db = await getRequestSqlServerDataSource()
    const result = await removeAiSafetyRuleTerms(db, body.termIds)
    await recordAdminPrivilegedActionSucceeded(context, {
      changedFields: ['isActive'],
      itemCount: body.termIds.length,
      operation: 'delete',
      resourceId: 'batch',
      resourceType: 'ai_safety_rule_term',
    })
    return noStore(NextResponse.json(result))
  },
})
