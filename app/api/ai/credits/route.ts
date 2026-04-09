import { NextResponse } from 'next/server'
import { getKeyInfo } from '@/lib/ai/openrouter-client'

export async function GET() {
  try {
    const info = await getKeyInfo()
    return NextResponse.json(info)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    const numericStatus =
      (err as { status?: unknown }).status ??
      (err as { statusCode?: unknown }).statusCode ??
      undefined
    let status: number
    if (
      typeof numericStatus === 'number' &&
      numericStatus >= 400 &&
      numericStatus < 600
    ) {
      status = numericStatus
    } else {
      const match = message.match(/\b([45]\d{2})\b/)
      status = match ? Number(match[1]) : 503
    }
    return NextResponse.json({ error: message }, { status })
  }
}
