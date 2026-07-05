import { NextResponse } from 'next/server'
import { getSpecificationById } from '@/lib/dal/requirements-specifications'
import { positiveIntegerStringSchema } from '@/lib/http/validation'
import { ReportDataError } from '@/lib/reports/data/server'
import type {
  AuthorizationService,
  RequestContext,
} from '@/lib/requirements/auth'
import { toHttpErrorPayload } from '@/lib/requirements/http-errors'
import { createRequirementsRestRuntime } from '@/lib/requirements/server'
import { authorize } from '@/lib/requirements/service-shared'

export type ReportRouteParams<T extends object = object> = Promise<
  T & { locale: string }
>

export type ReportRuntime = Awaited<
  ReturnType<typeof createRequirementsRestRuntime>
>

export function requirementReportRef(id: string): {
  id?: number
  uniqueId?: string
} {
  let decoded = id
  try {
    decoded = decodeURIComponent(id)
  } catch {
    decoded = id
  }
  if (/^\d+$/.test(decoded)) return { id: Number(decoded) }
  return { uniqueId: decoded }
}

export async function createReportRuntime(
  request: Request,
): Promise<ReportRuntime> {
  return createRequirementsRestRuntime(request)
}

export async function authorizeRequirementReportRead(
  authorization: AuthorizationService,
  context: RequestContext,
  id: string,
  view: 'detail' | 'history',
): Promise<void> {
  await authorize(
    authorization,
    {
      ...requirementReportRef(id),
      kind: 'get_requirement',
      view,
    },
    context,
  )
}

export async function authorizeSpecificationReportRead(
  authorization: AuthorizationService,
  context: RequestContext,
  specificationId: number,
): Promise<void> {
  await authorize(
    authorization,
    {
      kind: 'get_specification_items',
      specificationId,
    },
    context,
  )
}

export async function resolveReportSpecification(
  db: ReportRuntime['db'],
  specificationId: string,
): Promise<NonNullable<Awaited<ReturnType<typeof getSpecificationById>>>> {
  const parsedId = positiveIntegerStringSchema.safeParse(specificationId)
  if (!parsedId.success) {
    throw new ReportDataError(
      `Specification not found: ${specificationId}`,
      404,
    )
  }

  const specification = await getSpecificationById(db, parsedId.data)
  if (!specification) {
    throw new ReportDataError(
      `Specification not found: ${specificationId}`,
      404,
    )
  }

  return specification
}

export function reportErrorResponse(error: unknown): NextResponse {
  if (!(error instanceof ReportDataError)) {
    const { body, status } = toHttpErrorPayload(error)
    return NextResponse.json(
      { error: body.error },
      { headers: { 'Cache-Control': 'no-store' }, status },
    )
  }

  const status = error.status
  const message =
    error instanceof Error && status < 500
      ? error.message
      : 'Failed to generate PDF'

  return NextResponse.json(
    { error: message },
    { headers: { 'Cache-Control': 'no-store' }, status },
  )
}

export function splitCsvParam(value: string | null): string[] {
  return value
    ? value
        .split(',')
        .map(part => part.trim())
        .filter(Boolean)
    : []
}

export function timestampForFilename(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
    2,
    '0',
  )}-${String(date.getDate()).padStart(2, '0')} ${String(
    date.getHours(),
  ).padStart(2, '0')}.${String(date.getMinutes()).padStart(2, '0')}`
}
