import { NextResponse } from 'next/server'
import { getVisibleHsaIdPrefixes } from '@/lib/dal/ui-settings'
import { getRequestSqlServerDataSource } from '@/lib/db'
import { logSanitizedError, reportSqlFailure } from '@/lib/http/safe-errors'

export async function GET() {
  try {
    const db = await getRequestSqlServerDataSource()
    return NextResponse.json({
      prefixes: await getVisibleHsaIdPrefixes(db),
    })
  } catch (error) {
    logSanitizedError('Failed to load visible HSA-id prefixes', error)
    return NextResponse.json(
      reportSqlFailure(error, {
        source: 'rest',
        operation: 'hsa-id-prefixes',
      }) ?? { error: 'Failed to load HSA-id prefixes.' },
      { status: 500 },
    )
  }
}
