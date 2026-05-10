import { NextResponse } from 'next/server'

type JsonBodyResult =
  | { body: Record<string, unknown>; response?: never }
  | { body?: never; response: NextResponse }

export async function readJsonObject(
  request: Request,
): Promise<JsonBodyResult> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return invalidJsonBody()
  }

  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return invalidJsonBody()
  }

  return { body: body as Record<string, unknown> }
}

export function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
}

function invalidJsonBody(): JsonBodyResult {
  return {
    response: NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400 },
    ),
  }
}
