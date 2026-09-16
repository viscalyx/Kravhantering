import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  getSpecificationById,
  listSpecificationTraceabilityItems,
  type SpecificationItemRef,
} from '@/lib/dal/requirements-specifications'
import {
  idParamSchema,
  parseRouteParams,
  parseSearchParams,
  positiveIntegerStringSchema,
} from '@/lib/http/validation'
import { toHttpErrorPayload } from '@/lib/requirements/http-errors'
import { createRequirementsRestRuntime } from '@/lib/requirements/server'
import { authorize } from '@/lib/requirements/service-shared'
import { resolveAgreementSelection } from '@/lib/specifications/agreement-selection'
import { SPECIFICATION_ITEM_SELECTION_ACTION_LIMIT } from '@/lib/specifications/selection-action-limit'

export const dynamic = 'force-dynamic'

type Params = Promise<{ id: string }>

const itemRefSchema = z
  .string()
  .trim()
  .regex(/^(lib|local):[1-9]\d*$/, 'Expected stable specification item refs')

const querySchema = z
  .object({
    agreementId: positiveIntegerStringSchema.optional(),
    refs: z
      .preprocess(
        value => (Array.isArray(value) ? value : value == null ? [] : [value]),
        z
          .array(itemRefSchema)
          .min(1)
          .max(SPECIFICATION_ITEM_SELECTION_ACTION_LIMIT),
      )
      .refine(values => new Set(values).size === values.length, {
        message: 'Expected unique item references',
      }),
  })
  .strict()

export async function GET(
  request: NextRequest,
  { params }: { params: Params },
) {
  const parsedParams = await parseRouteParams(params, idParamSchema)
  if (!parsedParams.ok) return parsedParams.response

  const parsedQuery = parseSearchParams(
    request.nextUrl.searchParams,
    querySchema,
  )
  if (!parsedQuery.ok) return parsedQuery.response

  try {
    const runtime = await createRequirementsRestRuntime(request)
    const specification = await getSpecificationById(
      runtime.db,
      parsedParams.data.id,
    )
    if (!specification) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    await authorize(
      runtime.authorization,
      {
        kind: 'get_specification_items',
        specificationId: specification.id,
      },
      runtime.context,
    )

    const items = await runtime.db.transaction(async manager => {
      const agreementId = await resolveAgreementSelection(
        manager,
        specification.id,
        parsedQuery.data.agreementId,
      )
      return listSpecificationTraceabilityItems(
        manager,
        specification.id,
        parsedQuery.data.refs as SpecificationItemRef[],
        agreementId,
      )
    })

    return NextResponse.json({
      items: items.map(item => ({
        specificationItemStatusId: item.specificationItemStatusId,
        hasPendingDeviation: item.deviationCounts.pending > 0,
        hasApprovedDeviation: (item.deviationCounts.applicable ?? 0) > 0,
        itemRef: item.itemRef,
        kind: item.kind,
        needsReference: item.needsReference,
        needsReferenceId: item.needsReferenceId,
        uniqueId: item.uniqueId,
      })),
    })
  } catch (error) {
    const { body, status } = toHttpErrorPayload(error)
    return NextResponse.json(body, { status })
  }
}
