import { NextResponse } from 'next/server'
import type { z } from 'zod'
import {
  rfiListAreaUpdateSchema,
  specificationRfiListAreaParamsSchema,
} from '@/app/api/rfi-questions/_schemas'
import { recordAllowedActionAuditEvent } from '@/lib/audit/action-audit'
import { resolveSpecificationId } from '@/lib/dal/requirement-selection-questions'
import { updateSpecificationRfiAreaScope } from '@/lib/dal/rfi-questions'
import { getRequestSqlServerDataSource } from '@/lib/db'
import {
  type MutationPolicy,
  secureMutationRoute,
} from '@/lib/http/secure-mutation-route'
import { requireHumanActorSnapshot } from '@/lib/requirements/auth'

type RfiListAreaBody = z.infer<typeof rfiListAreaUpdateSchema>
type RfiListAreaParams = z.infer<typeof specificationRfiListAreaParamsSchema>

const policy = {
  action: ({ params }) => ({
    kind: 'manage_specification_rfi',
    operation: 'update_area',
    specificationSlug: params.id,
  }),
  kind: 'requirements',
} satisfies MutationPolicy<RfiListAreaBody, RfiListAreaParams>

export const PATCH = secureMutationRoute({
  bodySchema: rfiListAreaUpdateSchema,
  paramsSchema: specificationRfiListAreaParamsSchema,
  policy,
  handler: async ({ body, context, db, params }) => {
    const activeDb = db ?? (await getRequestSqlServerDataSource())
    const specificationId = await resolveSpecificationId(activeDb, params.id)
    if (!specificationId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    const actor = requireHumanActorSnapshot(context)
    const list = await updateSpecificationRfiAreaScope(
      activeDb,
      specificationId,
      params.areaId,
      body.isIncluded,
      actor,
    )
    await recordAllowedActionAuditEvent(activeDb, context, {
      action: 'specification_rfi_list.area.update',
      details: {
        areaId: params.areaId,
        changedFields: Object.keys(body),
      },
      targetId: specificationId,
      targetKind: 'requirements_specification',
    })
    return NextResponse.json({ list })
  },
})
