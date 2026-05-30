import { NextResponse } from 'next/server'
import { ReportDataError } from '@/lib/reports/data/server'

export type ReportRouteParams<T extends object = object> = Promise<
  T & { locale: string }
>

export function reportErrorResponse(error: unknown): NextResponse {
  const status = error instanceof ReportDataError ? error.status : 500
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
