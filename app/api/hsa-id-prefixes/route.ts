import { NextResponse } from 'next/server'
import {
  formatUiSettingsLoadError,
  getVisibleHsaIdPrefixes,
} from '@/lib/dal/ui-settings'
import { getRequestSqlServerDataSource } from '@/lib/db'

export async function GET() {
  try {
    const db = await getRequestSqlServerDataSource()
    return NextResponse.json({
      prefixes: await getVisibleHsaIdPrefixes(db),
    })
  } catch (error) {
    console.error(
      'Failed to load visible HSA-id prefixes',
      formatUiSettingsLoadError(error),
    )
    return NextResponse.json(
      { error: 'Failed to load HSA-id prefixes.' },
      { status: 500 },
    )
  }
}
