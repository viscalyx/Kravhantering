import { type NextRequest, NextResponse } from 'next/server'
import { createSpecificationSchema } from '@/app/api/requirements-specifications/schema'
import {
  createSpecification,
  isSlugTaken,
} from '@/lib/dal/requirements-specifications'
import { getRequestSqlServerDataSource } from '@/lib/db'
import {
  customMutationPolicy,
  secureMutationRoute,
} from '@/lib/http/secure-mutation-route'
import { requireHumanActorSnapshot } from '@/lib/requirements/auth'
import { validationError } from '@/lib/requirements/errors'
import { toHttpErrorPayload } from '@/lib/requirements/http-errors'
import { resolveVerifiedRequirementResponsibilityPerson } from '@/lib/requirements/responsibility-person-verification'
import { createRequirementsRestRuntime } from '@/lib/requirements/server'
import { canCreateSpecification } from '@/lib/specifications/permissions'

export async function GET(request: NextRequest) {
  try {
    const { context, service } = await createRequirementsRestRuntime(request)
    const payload = await service.listSpecifications(context, {
      includeRestFields: true,
      responseFormat: 'json',
    })
    return NextResponse.json({
      collectionPermissions: {
        canCreateSpecification: canCreateSpecification(context),
      },
      specifications: payload.specifications,
    })
  } catch (error) {
    const { body, status } = toHttpErrorPayload(error)
    return NextResponse.json(body, { status })
  }
}

export const POST = secureMutationRoute({
  bodySchema: createSpecificationSchema,
  policy: customMutationPolicy('specification.create', () => {}),
  handler: async ({ body, context }) => {
    const actor = requireHumanActorSnapshot(context)
    const responsibleHsaId = body.responsibleHsaId ?? actor.hsaId
    if (responsibleHsaId !== actor.hsaId) {
      throw validationError(
        'Specification lead must match the authenticated actor when creating a specification',
        { reason: 'specification_lead_must_match_actor' },
      )
    }

    const db = await getRequestSqlServerDataSource()
    if (await isSlugTaken(db, body.uniqueId)) {
      return NextResponse.json({ error: 'slug_taken' }, { status: 409 })
    }

    const responsiblePerson =
      await resolveVerifiedRequirementResponsibilityPerson(db, responsibleHsaId)
    const spec = await createSpecification(db, {
      ...body,
      responsibleHsaId,
      responsiblePerson,
    })
    return NextResponse.json(spec, { status: 201 })
  },
})
