import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { logSanitizedError } from '@/lib/http/safe-errors'
import {
  idParamSchema,
  parseRouteParams,
  positiveIntegerStringSchema,
} from '@/lib/http/validation'
import { isRequirementsServiceError } from '@/lib/requirements/errors'
import { toHttpErrorPayload } from '@/lib/requirements/http-errors'
import { createRequirementsRestRuntime } from '@/lib/requirements/server'

export const dynamic = 'force-dynamic'

type Params = Promise<{ id: string; localRequirementId: string }>

const graduationTargetAreasParamSchema = z
  .object({
    id: idParamSchema.shape.id,
    localRequirementId: positiveIntegerStringSchema,
  })
  .strict()

export async function GET(
  request: NextRequest,
  { params }: { params: Params },
) {
  const parsedParams = await parseRouteParams(
    params,
    graduationTargetAreasParamSchema,
  )
  if (!parsedParams.ok) {
    return parsedParams.response
  }

  const { id, localRequirementId } = parsedParams.data

  try {
    const { context, service } = await createRequirementsRestRuntime(request)
    const payload = await service.listGraduationTargetAreas(context, {
      localRequirementId,
      responseFormat: 'json',
      specificationId: id,
    })

    return NextResponse.json({
      areas: payload.areas,
      ok: true,
    })
  } catch (error) {
    if (isRequirementsServiceError(error)) {
      const { body, status } = toHttpErrorPayload(error)
      return NextResponse.json(body, { status })
    }

    logSanitizedError(
      'Failed to list graduation target requirement areas',
      error,
    )
    return NextResponse.json(
      { error: 'Failed to list graduation target requirement areas' },
      { status: 500 },
    )
  }
}
