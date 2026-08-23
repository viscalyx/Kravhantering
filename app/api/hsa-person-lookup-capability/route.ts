import { NextResponse } from 'next/server'
import { getStrictHsaPersonLookupSnapshot } from '@/lib/hsa/strict-person-lookup'
import { withRestResponsePolicy } from '@/lib/http/response-policy'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

async function getHandler(): Promise<NextResponse> {
  let available = false
  try {
    available = (await getStrictHsaPersonLookupSnapshot()) !== null
  } catch {
    // Readiness reports invalid local material. This authenticated capability
    // contract intentionally exposes only the bounded availability boolean.
  }
  return NextResponse.json({ available })
}

export const GET = withRestResponsePolicy(getHandler)
