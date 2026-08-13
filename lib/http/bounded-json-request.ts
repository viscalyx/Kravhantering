export interface ReadBoundedJsonRequestOptions {
  maxBytes: number
}

export type BoundedJsonRequestResult =
  | {
      data: unknown
      measuredBytes: number
      ok: true
      rawText: string
    }
  | {
      code: 'invalid_json' | 'request_bytes_exceeded'
      measuredBytes?: number
      ok: false
    }

function validContentLength(request: Request): number | undefined {
  const raw = request.headers.get('content-length')
  if (raw == null || !/^\d+$/.test(raw.trim())) return undefined
  const value = Number(raw)
  return Number.isSafeInteger(value) ? value : undefined
}

export async function readBoundedJsonRequest(
  request: Request,
  options: ReadBoundedJsonRequestOptions,
): Promise<BoundedJsonRequestResult> {
  const contentLength = validContentLength(request)
  if (contentLength !== undefined && contentLength > options.maxBytes) {
    return { code: 'request_bytes_exceeded', ok: false }
  }

  const reader = request.body?.getReader()
  const chunks: Uint8Array[] = []
  let measuredBytes = 0
  if (reader) {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      measuredBytes += value.byteLength
      if (measuredBytes > options.maxBytes) {
        await reader.cancel().catch(() => undefined)
        return {
          code: 'request_bytes_exceeded',
          measuredBytes,
          ok: false,
        }
      }
      chunks.push(value)
    }
  }

  const bytes = new Uint8Array(measuredBytes)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  const rawText = new TextDecoder().decode(bytes)
  try {
    return {
      data: JSON.parse(rawText) as unknown,
      measuredBytes,
      ok: true,
      rawText,
    }
  } catch {
    return { code: 'invalid_json', measuredBytes, ok: false }
  }
}
