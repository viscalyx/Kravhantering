import { NextResponse } from 'next/server'
import type { z } from 'zod'
import {
  rfiListItemUpdateSchema,
  specificationRfiListItemParamsSchema,
} from '@/app/api/rfi-questions/_schemas'
import { recordAllowedActionAuditEvent } from '@/lib/audit/action-audit'
import { getSpecificationById } from '@/lib/dal/requirements-specifications'
import { updateSpecificationRfiQuestionItem } from '@/lib/dal/rfi-questions'
import { getRequestSqlServerDataSource } from '@/lib/db'
import {
  type MutationPolicy,
  secureMutationRoute,
} from '@/lib/http/secure-mutation-route'
import { requireHumanActorSnapshot } from '@/lib/requirements/auth'

type RfiListItemBody = z.infer<typeof rfiListItemUpdateSchema>
type RfiListItemParams = z.infer<typeof specificationRfiListItemParamsSchema>

const policy = {
  action: ({ params }) => ({
    kind: 'manage_specification_rfi',
    operation: 'update_item',
    specificationId: params.id,
  }),
  kind: 'requirements',
} satisfies MutationPolicy<RfiListItemBody, RfiListItemParams>

export const PATCH = secureMutationRoute({
  bodySchema: rfiListItemUpdateSchema,
  paramsSchema: specificationRfiListItemParamsSchema,
  policy,
  handler: async ({ body, context, db, params }) => {
    const activeDb = db ?? (await getRequestSqlServerDataSource())
    const specification = await getSpecificationById(activeDb, params.id)
    if (!specification) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    const specificationId = specification.id
    const actor = requireHumanActorSnapshot(context)
    const list = await updateSpecificationRfiQuestionItem(
      activeDb,
      specificationId,
      params.questionId,
      body,
      actor,
    )
    await recordAllowedActionAuditEvent(activeDb, context, {
      action: 'specification_rfi_list.item.update',
      details: {
        changedFields: Object.keys(body),
        questionId: params.questionId,
      },
      targetId: specificationId,
      targetKind: 'requirements_specification',
    })
    return NextResponse.json({ list })
  },
})
