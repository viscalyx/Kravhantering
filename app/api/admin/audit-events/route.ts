import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  actionAuditEventsToCsv,
  assertAdminForActionAudit,
  listActionAuditEvents,
} from '@/lib/audit/action-audit'
import { isValidClientIp } from '@/lib/auth/client-ip'
import { getRequestSqlServerDataSource } from '@/lib/db'
import { logSanitizedError } from '@/lib/http/safe-errors'
import { parseSearchParams } from '@/lib/http/validation'
import { createRequestContext } from '@/lib/requirements/auth'
import { isRequirementsServiceError } from '@/lib/requirements/errors'
import { toHttpErrorPayload } from '@/lib/requirements/http-errors'
import { withUtf8Bom } from '@/lib/text-export'

export const dynamic = 'force-dynamic'

const optionalTrimmedStringSchema = (maxLength: number) =>
  z.preprocess(
    value =>
      typeof value === 'string' && value.trim() === '' ? undefined : value,
    z.string().trim().min(1).max(maxLength).optional(),
  )

const dateTimeSchema = z.preprocess(
  value =>
    typeof value === 'string' && value.trim() === '' ? undefined : value,
  z
    .string()
    .trim()
    .refine(value => !Number.isNaN(new Date(value).getTime()), {
      message: 'Expected an ISO date-time string.',
    })
    .transform(value => new Date(value))
    .optional(),
)

const clientIpSchema = z.preprocess(
  value =>
    typeof value === 'string' && value.trim() === '' ? undefined : value,
  z
    .string()
    .trim()
    .max(45)
    .refine(isValidClientIp, { message: 'Expected a valid client IP address.' })
    .optional(),
)

const positiveIntegerStringSchema = z.preprocess(
  value =>
    typeof value === 'string' && value.trim() === '' ? undefined : value,
  z.coerce.number().int().positive().optional(),
)

const auditEventsQuerySchema = z
  .object({
    action: optionalTrimmedStringSchema(64),
    actor_hsa_id: optionalTrimmedStringSchema(64),
    client_ip: clientIpSchema,
    decision: z.preprocess(
      value =>
        typeof value === 'string' && value.trim() === '' ? undefined : value,
      z.enum(['allowed', 'denied']).optional(),
    ),
    format: z.enum(['csv']).optional(),
    from: dateTimeSchema,
    locale: z.enum(['en', 'sv']).optional().default('en'),
    page: positiveIntegerStringSchema,
    pageSize: positiveIntegerStringSchema,
    target_id: optionalTrimmedStringSchema(255),
    target_kind: optionalTrimmedStringSchema(64),
    to: dateTimeSchema,
  })
  .strict()

function noStore<T extends NextResponse>(response: T): T {
  response.headers.set('Cache-Control', 'no-store')
  return response
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const parsedQuery = parseSearchParams(
    url.searchParams,
    auditEventsQuerySchema,
  )
  if (!parsedQuery.ok) return noStore(parsedQuery.response)

  try {
    const context = await createRequestContext(request, 'rest')
    assertAdminForActionAudit(context)
    const db = await getRequestSqlServerDataSource()
    const result = await listActionAuditEvents(db, {
      action: parsedQuery.data.action,
      actorHsaId: parsedQuery.data.actor_hsa_id,
      clientIp: parsedQuery.data.client_ip,
      decision: parsedQuery.data.decision,
      from: parsedQuery.data.from,
      page: parsedQuery.data.page,
      pageSize: parsedQuery.data.pageSize,
      targetId: parsedQuery.data.target_id,
      targetKind: parsedQuery.data.target_kind,
      to: parsedQuery.data.to,
    })

    if (parsedQuery.data.format === 'csv') {
      const filename =
        parsedQuery.data.locale === 'sv' ? 'atgardslogg.csv' : 'action-log.csv'
      return noStore(
        new NextResponse(
          withUtf8Bom(
            actionAuditEventsToCsv(result.events, parsedQuery.data.locale),
          ),
          {
            headers: {
              'Content-Disposition': `attachment; filename="${filename}"`,
              'Content-Type': 'text/csv; charset=utf-8',
            },
          },
        ),
      )
    }

    return noStore(NextResponse.json(result))
  } catch (error) {
    if (isRequirementsServiceError(error)) {
      const { body, status } = toHttpErrorPayload(error)
      return noStore(NextResponse.json(body, { status }))
    }
    logSanitizedError('Failed to list action log events', error)
    return noStore(
      NextResponse.json(
        { error: 'Failed to list action log events' },
        { status: 500 },
      ),
    )
  }
}
