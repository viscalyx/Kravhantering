import { NextResponse } from 'next/server'
import { listModels } from '@/lib/ai/ollama-client'

export async function GET() {
  try {
    const models = await listModels()
    return NextResponse.json({ models })
  } catch {
    return NextResponse.json(
      { error: 'Ollama is not available', models: [] },
      { status: 503 },
    )
  }
}
