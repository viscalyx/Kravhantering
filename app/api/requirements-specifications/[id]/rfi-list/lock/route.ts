import { NextResponse } from 'next/server'
import type { z } from 'zod'
import { specificationRfiListParamsSchema } from '@/app/api/rfi-questions/_schemas'
import { recordAllowedActionAuditEvent } from '@/lib/audit/action-audit'
import { getSpecificationById } from '@/lib/dal/requirements-specifications'
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
    specificationId: params.id,
  }),
  kind: 'requirements',
} satisfies MutationPolicy<undefined, RfiListParams>

export const POST = secureMutationRoute({
  paramsSchema: specificationRfiListParamsSchema,
  policy,
  handler: async ({ context, db, params }) => {
    const activeDb = db ?? (await getRequestSqlServerDataSource())
    const specification = await getSpecificationById(activeDb, params.id)
    if (!specification) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    const specificationId = specification.id
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
