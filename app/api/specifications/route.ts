import { type NextRequest, NextResponse } from 'next/server'
import { createSpecificationSchema } from '@/app/api/specifications/schema'
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
import { toHttpErrorPayload } from '@/lib/requirements/http-errors'
import { resolveVerifiedRequirementResponsibilityPerson } from '@/lib/requirements/responsibility-person-verification'
import { createRequirementsRestRuntime } from '@/lib/requirements/server'

export async function GET(request: NextRequest) {
  try {
    const { context, service } = await createRequirementsRestRuntime(request)
    const payload = await service.listSpecifications(context, {
      includeRestFields: true,
      responseFormat: 'json',
    })
    return NextResponse.json({ specifications: payload.specifications })
  } catch (error) {
    const { body, status } = toHttpErrorPayload(error)
    return NextResponse.json(body, { status })
  }
}

export const POST = secureMutationRoute({
  bodySchema: createSpecificationSchema,
  policy: customMutationPolicy('specification.create', () => {}),
  handler: async ({ body, context }) => {
    const db = await getRequestSqlServerDataSource()
    const actor = requireHumanActorSnapshot(context)

    if (await isSlugTaken(db, body.uniqueId)) {
      return NextResponse.json({ error: 'slug_taken' }, { status: 409 })
    }

    const responsiblePerson =
      await resolveVerifiedRequirementResponsibilityPerson(db, actor.hsaId)
    const spec = await createSpecification(db, {
      ...body,
      responsibleHsaId: actor.hsaId,
      responsiblePerson,
    })
    return NextResponse.json(spec, { status: 201 })
  },
})
