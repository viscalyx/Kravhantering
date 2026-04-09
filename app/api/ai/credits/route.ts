import { NextResponse } from 'next/server'
import { getKeyInfo } from '@/lib/ai/openrouter-client'

export async function GET() {
  try {
    const info = await getKeyInfo()
    return NextResponse.json(info)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    const status = message.includes('401') ? 401 : 503
    return NextResponse.json({ error: message }, { status })
  }
}
