import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSpecificationById } from '@/lib/dal/requirements-specifications'
import { logSanitizedError } from '@/lib/http/safe-errors'
import {
  idParamSchema,
  optionalQueryArraySchema,
  optionalSearchStringSchema,
  parseRouteParams,
  parseSearchParams,
  positiveIntegerStringSchema,
} from '@/lib/http/validation'
import { toHttpErrorPayload } from '@/lib/requirements/http-errors'
import { createRequirementsRestRuntime } from '@/lib/requirements/server'
import { authorize } from '@/lib/requirements/service-shared'
import {
  MAX_SPECIFICATION_REQUIREMENT_PACKAGE_PAGE_LIMIT,
  querySpecificationRequirementPackagePage,
} from '@/lib/requirements/specification-requirement-packages'

export const dynamic = 'force-dynamic'

type Params = Promise<{ id: string }>

const includeIdsSchema = optionalQueryArraySchema(
  positiveIntegerStringSchema,
).refine(
  values => !values || new Set(values).size === values.length,
  'Expected unique positive integers',
)

const querySchema = z
  .object({
    cursor: z.string().min(1).max(2048).optional(),
    includeIds: includeIdsSchema,
    limit: positiveIntegerStringSchema
      .refine(
        value => value <= MAX_SPECIFICATION_REQUIREMENT_PACKAGE_PAGE_LIMIT,
        'Expected a page size no greater than 100',
      )
      .optional(),
    search: optionalSearchStringSchema,
  })
  .strict()

export async function GET(
  request: NextRequest,
  { params }: { params: Params },
) {
  const parsedParams = await parseRouteParams(params, idParamSchema)
  if (!parsedParams.ok) return parsedParams.response
  const parsedQuery = parseSearchParams(
    new URL(request.url).searchParams,
    querySchema,
  )
  if (!parsedQuery.ok) return parsedQuery.response

  try {
    const { authorization, context, db } =
      await createRequirementsRestRuntime(request)
    const specification = await getSpecificationById(db, parsedParams.data.id)
    if (!specification) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    await authorize(
      authorization,
      {
        kind: 'get_specification_items',
        specificationId: specification.id,
      },
      context,
    )
    const result = await querySpecificationRequirementPackagePage(db, {
      ...parsedQuery.data,
      specificationId: specification.id,
    })
    return NextResponse.json(result)
  } catch (error) {
    const { body, status } = toHttpErrorPayload(error)
    if (status >= 500) {
      logSanitizedError(
        'Failed to list requirement packages for requirements specification',
        error,
        { specificationId: parsedParams.data.id },
      )
    }
    return NextResponse.json(body, { status })
  }
}
