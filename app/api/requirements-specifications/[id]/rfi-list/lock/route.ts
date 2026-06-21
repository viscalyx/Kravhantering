import { NextResponse } from 'next/server'
import type { z } from 'zod'
import { specificationRfiListParamsSchema } from '@/app/api/rfi-questions/_schemas'
import { recordAllowedActionAuditEvent } from '@/lib/audit/action-audit'
import { resolveSpecificationId } from '@/lib/dal/requirement-selection-questions'
import { lockSpecificationRfiList } from '@/lib/dal/rfi-questions'
import { getRequestSqlServerDataSource } from '@/lib/db'
import {
  type MutationPolicy,
  secureMutationRoute,
} from '@/lib/http/secure-mutation-route'
import { requireHumanActorSnapshot } from '@/lib/requirements/auth'

type RfiListParams = z.infer<typeof specificationRfiListParamsSchema>

const policy = {
  action: ({ params }) => ({
    kind: 'manage_specification_rfi',
    operation: 'lock',
    specificationSlug: params.id,
  }),
  kind: 'requirements',
} satisfies MutationPolicy<undefined, RfiListParams>

export const POST = secureMutationRoute({
  paramsSchema: specificationRfiListParamsSchema,
  policy,
  handler: async ({ context, db, params }) => {
    const activeDb = db ?? (await getRequestSqlServerDataSource())
    const specificationId = await resolveSpecificationId(activeDb, params.id)
    if (!specificationId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    const actor = requireHumanActorSnapshot(context)
    const list = await lockSpecificationRfiList(
      activeDb,
      specificationId,
      actor,
    )
    await recordAllowedActionAuditEvent(activeDb, context, {
      action: 'specification_rfi_list.lock',
      targetId: specificationId,
      targetKind: 'requirements_specification',
    })
    return NextResponse.json({ list })
  },
})
