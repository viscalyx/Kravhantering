import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { recordAllowedActionAuditEvent } from '@/lib/audit/action-audit'
import { HSA_ID_MAX_LENGTH, isHsaId } from '@/lib/auth/hsa-id'
import {
  getRequirementPackageById,
  listRequirementPackageCoAuthors,
  replaceRequirementPackageCoAuthors,
} from '@/lib/dal/requirement-packages'
import { getRequestSqlServerDataSource } from '@/lib/db'
import {
  customMutationPolicy,
  secureMutationRoute,
} from '@/lib/http/secure-mutation-route'
import { idParamSchema, parseRouteParams } from '@/lib/http/validation'
import {
  createRequestContext,
  type RequestContext,
} from '@/lib/requirements/auth'
import { toHttpErrorPayload } from '@/lib/requirements/http-errors'
import { requireRequirementPackageLeadOrAdmin } from '@/lib/requirements/requirement-package-permissions'
import { resolveVerifiedRequirementResponsibilityPeople } from '@/lib/requirements/responsibility-person-verification'

export const dynamic = 'force-dynamic'

const hsaIdSchema = z.string().trim().max(HSA_ID_MAX_LENGTH).refine(isHsaId, {
  message:
    'Expected HSA-id format <two-letter country code><10-digit org no>-<alphanumeric suffix>',
})

const updateRequirementPackageCoAuthorsSchema = z
  .object({
    coAuthorHsaIds: z.array(hsaIdSchema),
  })
  .strict()

function assignmentActor(context: RequestContext) {
  return {
    displayName:
      context.actor.displayName.trim() ||
      context.actor.id ||
      context.actor.hsaId,
    hsaId: context.actor.hsaId,
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const parsedParams = await parseRouteParams(params, idParamSchema)
  if (!parsedParams.ok) {
    return parsedParams.response
  }

  try {
    const db = await getRequestSqlServerDataSource()
    const context = await createRequestContext(request, 'rest')
    const requirementPackage = await getRequirementPackageById(
      db,
      parsedParams.data.id,
    )
    if (!requirementPackage) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    await requireRequirementPackageLeadOrAdmin(
      db,
      context,
      parsedParams.data.id,
      'requirement_package.update',
    )

    return NextResponse.json({
      coAuthors: await listRequirementPackageCoAuthors(
        db,
        parsedParams.data.id,
      ),
    })
  } catch (error) {
    const { body, status } = toHttpErrorPayload(error)
    return NextResponse.json(body, { status })
  }
}

export const PUT = secureMutationRoute({
  bodySchema: updateRequirementPackageCoAuthorsSchema,
  paramsSchema: idParamSchema,
  policy: customMutationPolicy<
    z.infer<typeof updateRequirementPackageCoAuthorsSchema>,
    z.infer<typeof idParamSchema>
  >('requirement_package.co_authors.update', async ({ context, params }) => {
    const db = await getRequestSqlServerDataSource()
    await requireRequirementPackageLeadOrAdmin(
      db,
      context,
      params.id,
      'requirement_package.update',
    )
  }),
  handler: async ({ body, context, params }) => {
    const db = await getRequestSqlServerDataSource()
    const requirementPackage = await getRequirementPackageById(db, params.id)
    if (!requirementPackage) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const coAuthorPeople = await resolveVerifiedRequirementResponsibilityPeople(
      db,
      body.coAuthorHsaIds,
    )
    const result = await replaceRequirementPackageCoAuthors(db, params.id, {
      changedBy: assignmentActor(context),
      coAuthorHsaIds: body.coAuthorHsaIds,
      coAuthorPeople,
    })
    if (!result) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    await recordAllowedActionAuditEvent(db, context, {
      action: 'requirement_package.co_authors.update',
      details: { coAuthorCount: result.coAuthorHsaIds.length },
      targetId: params.id,
      targetKind: 'requirement_package',
    })
    return NextResponse.json(result)
  },
})
