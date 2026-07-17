import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  getSpecificationById,
  listSpecificationTraceabilityItems,
  type SpecificationItemRef,
} from '@/lib/dal/requirements-specifications'
import {
  ARRAY_INPUT_MAX_ITEMS,
  idParamSchema,
  parseRouteParams,
  parseSearchParams,
} from '@/lib/http/validation'
import { toHttpErrorPayload } from '@/lib/requirements/http-errors'
import { createRequirementsRestRuntime } from '@/lib/requirements/server'
import { authorize } from '@/lib/requirements/service-shared'

export const dynamic = 'force-dynamic'

type Params = Promise<{ id: string }>

const itemRefSchema = z
  .string()
  .trim()
  .regex(/^(lib|local):[1-9]\d*$/, 'Expected stable specification item refs')

const querySchema = z
  .object({
    refs: z
      .preprocess(
        value => (Array.isArray(value) ? value : value == null ? [] : [value]),
        z.array(itemRefSchema).min(1).max(ARRAY_INPUT_MAX_ITEMS),
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

    const items = await listSpecificationTraceabilityItems(
      runtime.db,
      specification.id,
      parsedQuery.data.refs as SpecificationItemRef[],
    )

    return NextResponse.json({
      items: items.map(item => ({
        itemRef: item.itemRef,
        kind: item.kind,
        needsReference: item.needsReference,
        uniqueId: item.uniqueId,
      })),
    })
  } catch (error) {
    const { body, status } = toHttpErrorPayload(error)
    return NextResponse.json(body, { status })
  }
}
