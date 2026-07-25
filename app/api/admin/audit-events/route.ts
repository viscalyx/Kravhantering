import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  actionAuditCsvHeaders,
  assertAdminForActionAudit,
  listActionAuditEvents,
  traverseActionAuditEventsForCsv,
} from '@/lib/audit/action-audit'
import { isValidClientIp } from '@/lib/auth/client-ip'
import { getRequestSqlServerDataSource } from '@/lib/db'
import { runBoundedCsvOutput } from '@/lib/generated-output/csv-runner'
import { logSanitizedError } from '@/lib/http/safe-errors'
import { parseSearchParams } from '@/lib/http/validation'
import { createRequestContext } from '@/lib/requirements/auth'
import { isRequirementsServiceError } from '@/lib/requirements/errors'
import { toHttpErrorPayload } from '@/lib/requirements/http-errors'

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

function noStore<T extends Response>(response: T): T {
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
    const filters = {
      action: parsedQuery.data.action,
      actorHsaId: parsedQuery.data.actor_hsa_id,
      clientIp: parsedQuery.data.client_ip,
      decision: parsedQuery.data.decision,
      from: parsedQuery.data.from,
      targetId: parsedQuery.data.target_id,
      targetKind: parsedQuery.data.target_kind,
      to: parsedQuery.data.to,
    }

    if (parsedQuery.data.format === 'csv') {
      const filename =
        parsedQuery.data.locale === 'sv' ? 'atgardslogg.csv' : 'action-log.csv'
      return noStore(
        await runBoundedCsvOutput({
          context,
          db,
          generateRows: async ({ maxItems, signal, writeRow }) => {
            await traverseActionAuditEventsForCsv(db, filters, {
              locale: parsedQuery.data.locale,
              maxItems,
              signal,
              writeRow,
            })
          },
          headers: actionAuditCsvHeaders(parsedQuery.data.locale),
          operation: 'admin.action_log_csv_export',
          requestSignal: request.signal,
          responseHeaders: {
            'Cache-Control': 'no-store',
            'Content-Disposition': `attachment; filename="${filename}"`,
            'Content-Type': 'text/csv; charset=utf-8',
          },
        }),
      )
    }

    const result = await listActionAuditEvents(db, {
      ...filters,
      page: parsedQuery.data.page,
      pageSize: parsedQuery.data.pageSize,
    })

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
