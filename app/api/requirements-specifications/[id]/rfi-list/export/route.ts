import { type NextRequest, NextResponse } from 'next/server'
import { createElement } from 'react'
import {
  rfiListExportQuerySchema,
  specificationRfiListParamsSchema,
} from '@/app/api/rfi-questions/_schemas'
import { getSpecificationById } from '@/lib/dal/requirements-specifications'
import { getSpecificationRfiList } from '@/lib/dal/rfi-questions'
import { parseRouteParams, parseSearchParams } from '@/lib/http/validation'
import { applyResponseCorrelationHeaders } from '@/lib/observability/request-ids'
import { renderPdfResponse } from '@/lib/pdf/server-response'
import { toHttpErrorPayload } from '@/lib/requirements/http-errors'
import { createRequirementsRestRuntime } from '@/lib/requirements/server'
import { authorize } from '@/lib/requirements/service-shared'
import {
  buildSpecificationRfiListCsv,
  default as SpecificationRfiListPdfRenderer,
} from '@/lib/rfi/rfi-list-export'
import { withUtf8Bom } from '@/lib/text-export'

export const dynamic = 'force-dynamic'

type Params = Promise<{ id: string }>

const RESERVED_FILENAME_CHARS = /[/\\:*?"<>|]+/g

function csvContentDisposition(filename: string): string {
  const sanitized = filename
    .replace(RESERVED_FILENAME_CHARS, '-')
    .replace(/\s+/g, ' ')
    .trim()
  const withExtension = sanitized.toLowerCase().endsWith('.csv')
    ? sanitized
    : `${sanitized}.csv`
  const fallback = withExtension.replace(/[^\x20-\x7e]/g, '_')

  return `attachment; filename="${fallback.replace(/"/g, '\\"')}"; filename*=UTF-8''${encodeURIComponent(withExtension)}`
}

function errorResponse(error: unknown) {
  const { body, status } = toHttpErrorPayload(error)
  return NextResponse.json(body, {
    headers: { 'Cache-Control': 'no-store' },
    status,
  })
}

export async function GET(
  request: NextRequest,
  { params }: { params: Params },
) {
  const parsedParams = await parseRouteParams(
    params,
    specificationRfiListParamsSchema,
  )
  if (!parsedParams.ok) return parsedParams.response
  const parsedQuery = parseSearchParams(
    request.nextUrl.searchParams,
    rfiListExportQuerySchema,
  )
  if (!parsedQuery.ok) return parsedQuery.response

  const runtime = await createRequirementsRestRuntime(request)
  try {
    const specification = await getSpecificationById(
      runtime.db,
      parsedParams.data.id,
    )
    if (!specification) {
      return applyResponseCorrelationHeaders(
        NextResponse.json(
          { error: 'Specification not found' },
          { headers: { 'Cache-Control': 'no-store' }, status: 404 },
        ),
        runtime.context,
      )
    }

    await authorize(
      runtime.authorization,
      { kind: 'get_specification_items', specificationId: specification.id },
      runtime.context,
    )

    const list = await getSpecificationRfiList(runtime.db, specification.id)
    const exportMeta = {
      name: specification.name,
      specificationCode: specification.specificationCode,
    }
    const label =
      parsedQuery.data.locale === 'sv' ? 'RFI-frågelista' : 'RFI question list'
    const baseFilename = `${label} ${specification.name} ${specification.specificationCode}`

    if (parsedQuery.data.format === 'pdf') {
      const response = await renderPdfResponse(
        createElement(SpecificationRfiListPdfRenderer, {
          list,
          locale: parsedQuery.data.locale,
          specification: exportMeta,
        }),
        `${baseFilename}.pdf`,
      )
      return applyResponseCorrelationHeaders(response, runtime.context)
    }

    const response = new NextResponse(
      withUtf8Bom(
        buildSpecificationRfiListCsv(exportMeta, list, parsedQuery.data.locale),
      ),
      {
        headers: {
          'Cache-Control': 'no-store',
          'Content-Disposition': csvContentDisposition(`${baseFilename}.csv`),
          'Content-Type': 'text/csv; charset=utf-8',
        },
      },
    )
    return applyResponseCorrelationHeaders(response, runtime.context)
  } catch (error) {
    return applyResponseCorrelationHeaders(
      errorResponse(error),
      runtime.context,
    )
  }
}
