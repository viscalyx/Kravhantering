import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getRequestSqlServerDataSource } from '@/lib/db'
import {
  parseRouteParams,
  positiveIntegerStringSchema,
  refOrPositiveIntegerSegmentSchema,
} from '@/lib/http/validation'
import { createRequestContext } from '@/lib/requirements/auth'
import { internalError } from '@/lib/requirements/errors'
import {
  createRequirementsService,
  toHttpErrorPayload,
} from '@/lib/requirements/service'
import type { RequirementVersionResponse } from '@/lib/requirements/types'
import { parseRequirementRef } from '../../../parse-requirement-ref'

type Params = Promise<{ id: string; version: string }>

const versionParamsSchema = z
  .object({
    id: refOrPositiveIntegerSegmentSchema,
    version: positiveIntegerStringSchema,
  })
  .strict()

export async function GET(
  _request: NextRequest,
  { params }: { params: Params },
) {
  const parsedParams = await parseRouteParams(params, versionParamsSchema)
  if (!parsedParams.ok) return parsedParams.response
  const { id, version } = parsedParams.data
  const db = await getRequestSqlServerDataSource()
  const service = createRequirementsService(db)

  try {
    const context = await createRequestContext(_request, 'rest')
    const ref = parseRequirementRef(id)
    const result = await service.getRequirement(context, {
      ...ref,
      versionNumber: version,
      view: 'version',
    })
    const versionDetail = result.version
    if (!versionDetail) {
      throw internalError(
        `Version ${version} was not returned for requirement ${id}`,
      )
    }

    const responseBody: RequirementVersionResponse = {
      uniqueId: result.requirement.uniqueId,
      version: versionDetail,
    }

    return NextResponse.json(responseBody)
  } catch (error) {
    const { body, status } = toHttpErrorPayload(error)
    return NextResponse.json(body, { status })
  }
}
