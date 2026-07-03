import { NextResponse } from 'next/server'
import { z } from 'zod'
import { recordAdminPrivilegedActionSucceeded } from '@/lib/admin/privileged-audit'
import {
  AI_SAFETY_TERM_DIRECTIONS,
  deleteCustomAiSafetyRuleTerm,
  updateAiSafetyRuleTerm,
} from '@/lib/dal/ai-safety-rules'
import { getRequestSqlServerDataSource } from '@/lib/db'
import { noStore } from '@/lib/http/cache-control'
import {
  adminMutationPolicy,
  secureMutationRoute,
} from '@/lib/http/secure-mutation-route'
import { positiveIntegerStringSchema } from '@/lib/http/validation'

const paramsSchema = z
  .object({
    id: positiveIntegerStringSchema,
  })
  .strict()

const updateTermSchema = z
  .object({
    direction: z.enum(AI_SAFETY_TERM_DIRECTIONS).optional(),
    isActive: z.boolean().optional(),
  })
  .strict()
  .refine(body => Object.keys(body).length > 0, {
    message: 'Expected at least one AI safety term change.',
  })

export const PATCH = secureMutationRoute({
  bodySchema: updateTermSchema,
  decorateErrorResponse: noStore,
  paramsSchema,
  policy: adminMutationPolicy(),
  handler: async ({ body, context, params }) => {
    const db = await getRequestSqlServerDataSource()
    const term = await updateAiSafetyRuleTerm(db, params.id, body)
    await recordAdminPrivilegedActionSucceeded(context, {
      changedFields: Object.keys(body),
      operation: 'update',
      resourceId: term.id,
      resourceType: 'ai_safety_rule_term',
    })
    return noStore(NextResponse.json({ term }))
  },
})

export const DELETE = secureMutationRoute({
  decorateErrorResponse: noStore,
  paramsSchema,
  policy: adminMutationPolicy(),
  handler: async ({ context, params }) => {
    const db = await getRequestSqlServerDataSource()
    const term = await deleteCustomAiSafetyRuleTerm(db, params.id)
    await recordAdminPrivilegedActionSucceeded(context, {
      operation: 'delete',
      resourceId: term.id,
      resourceType: 'ai_safety_rule_term',
    })
    return noStore(NextResponse.json({ term }))
  },
})
