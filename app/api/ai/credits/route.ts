import { NextResponse } from 'next/server'
import { getKeyInfo } from '@/lib/ai/openrouter-client'
import {
  AI_CREDIT_INFORMATION_UNAVAILABLE_MESSAGE,
  logSanitizedError,
} from '@/lib/http/safe-errors'

export async function GET() {
  try {
    const info = await getKeyInfo()
    return NextResponse.json(info)
  } catch (err) {
    logSanitizedError('Failed to get AI credit information', err)
    return NextResponse.json(
      { error: AI_CREDIT_INFORMATION_UNAVAILABLE_MESSAGE },
      { status: 503 },
    )
  }
}
