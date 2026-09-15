import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { getSpecificationById } from '@/lib/dal/requirements-specifications'
import { runBoundedStructuredOutput } from '@/lib/generated-output/structured-runner'
import { withRestResponsePolicy } from '@/lib/http/response-policy'
import {
  idParamSchema,
  localeSchema,
  parseRouteParams,
  parseSearchParams,
  positiveIntegerStringSchema,
} from '@/lib/http/validation'
import { applyResponseCorrelationHeaders } from '@/lib/observability/request-ids'
import { synchronousGeneratedOutputErrorResponse } from '@/lib/pdf/synchronous-generation'
import { ReportDataError } from '@/lib/reports/data/server'
import { collectCompleteSpecificationOutputData } from '@/lib/reports/data/specification-output'
import { getSpecificationReportProfileForLifecycleStatus } from '@/lib/reports/specification-profiles'
import { buildSpecificationProfileReport } from '@/lib/reports/templates/specification-profile-template'
import { toHttpErrorPayload } from '@/lib/requirements/http-errors'
import { createRequirementsRestRuntime } from '@/lib/requirements/server'
import { authorize } from '@/lib/requirements/service-shared'

export const dynamic = 'force-dynamic'

type Params = Promise<{ id: string }>

const specificationParamSchema = idParamSchema

const reportOutputQuerySchema = z
  .object({
    agreementId: positiveIntegerStringSchema.optional(),
    locale: localeSchema.optional().default('en'),
    profile: z.enum(['procurement', 'progress', 'management']),
  })
  .strict()

function errorResponse(error: unknown) {
  if (error instanceof ReportDataError) {
    return NextResponse.json({ error: error.message }, { status: error.status })
  }

  const { body, status } = toHttpErrorPayload(error)
  return NextResponse.json(body, {
    status,
  })
}

async function getHandler(
  request: NextRequest,
  { params }: { params: Params },
) {
  const parsedParams = await parseRouteParams(params, specificationParamSchema)
  if (!parsedParams.ok) {
    return parsedParams.response
  }
  const parsedQuery = parseSearchParams(
    request.nextUrl.searchParams,
    reportOutputQuerySchema,
  )
  if (!parsedQuery.ok) {
    return parsedQuery.response
  }

  const { id } = parsedParams.data
  const { profile } = parsedQuery.data

  const runtime = await createRequirementsRestRuntime(request)
  try {
    const specification = await getSpecificationById(runtime.db, id)
    if (!specification) {
      throw new ReportDataError(`Specification not found: ${id}`, 404)
    }

    await authorize(
      runtime.authorization,
      { kind: 'get_specification_items', specificationId: specification.id },
      runtime.context,
    )

    if (
      getSpecificationReportProfileForLifecycleStatus(
        specification.specificationLifecycleStatusId,
      ) !== profile
    ) {
      throw new ReportDataError(
        'Report profile is not available for this specification lifecycle status',
        409,
      )
    }

    const response = await runBoundedStructuredOutput({
      db: runtime.db,
      context: runtime.context,
      output: 'json',
      requestSignal: request.signal,
      collect: async ({ maxItems, signal, itemLimitError }) => {
        const data = await collectCompleteSpecificationOutputData(
          runtime.db,
          specification.id,
          {
            agreementId: parsedQuery.data.agreementId,
            maxItems,
            signal,
            createItemLimitError: itemLimitError,
          },
        )
        return buildSpecificationProfileReport(
          data,
          profile,
          parsedQuery.data.locale,
        )
      },
    })
    return applyResponseCorrelationHeaders(response, runtime.context)
  } catch (error) {
    return applyResponseCorrelationHeaders(
      synchronousGeneratedOutputErrorResponse('json', error) ??
        errorResponse(error),
      runtime.context,
    )
  }
}

export const GET = withRestResponsePolicy(getHandler)
