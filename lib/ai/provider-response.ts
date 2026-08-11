import {
  AI_PROVIDER_RESPONSE_LIMITS,
  type AiProviderDiagnosticContext,
  type AiProviderError,
  type AiProviderOperation,
  classifyAiProviderStatus,
  createAiProviderError,
  getAiProviderContentTypeCategory,
  getSafeProviderCode,
  getSafeUpstreamRequestId,
  isAiProviderError,
} from '@/lib/ai/provider-errors'

interface ProviderResponseOptions extends AiProviderDiagnosticContext {
  operation: AiProviderOperation
}

interface BoundedBody {
  bytes: Uint8Array
  observedBytes: number
}

async function readBoundedBody(
  response: Response,
  limit: number,
  options: ProviderResponseOptions,
): Promise<BoundedBody> {
  if (!response.body) {
    throw createAiProviderError({
      ...options,
      code: 'ai_provider_invalid_response',
      metadata: {
        contentTypeCategory: getAiProviderContentTypeCategory(
          response.headers.get('content-type'),
        ),
        upstreamRequestId: getSafeUpstreamRequestId(response.headers),
      },
      status: response.status,
    })
  }

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let observedBytes = 0
  try {
    for (;;) {
      let result: ReadableStreamReadResult<Uint8Array>
      try {
        result = await reader.read()
      } catch {
        throw createAiProviderError({
          ...options,
          code: 'ai_provider_response_read_failed',
          metadata: {
            contentTypeCategory: getAiProviderContentTypeCategory(
              response.headers.get('content-type'),
            ),
            observedBytes,
            upstreamRequestId: getSafeUpstreamRequestId(response.headers),
          },
          status: response.status,
        })
      }
      if (result.done) break
      observedBytes += result.value.byteLength
      if (observedBytes > limit) {
        await reader.cancel().catch(() => undefined)
        throw createAiProviderError({
          ...options,
          code: 'ai_provider_response_too_large',
          metadata: {
            contentTypeCategory: getAiProviderContentTypeCategory(
              response.headers.get('content-type'),
            ),
            observedBytes,
            truncated: true,
            upstreamRequestId: getSafeUpstreamRequestId(response.headers),
          },
          status: response.status,
        })
      }
      chunks.push(result.value)
    }
  } finally {
    reader.releaseLock()
  }

  const bytes = new Uint8Array(observedBytes)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return { bytes, observedBytes }
}

function decodeUtf8(bytes: Uint8Array): string {
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
}

export async function readAiProviderErrorResponse(
  response: Response,
  options: ProviderResponseOptions,
): Promise<AiProviderError> {
  const contentTypeCategory = getAiProviderContentTypeCategory(
    response.headers.get('content-type'),
  )
  const baseMetadata = {
    contentTypeCategory,
    upstreamRequestId: getSafeUpstreamRequestId(response.headers),
  }

  if (contentTypeCategory !== 'json') {
    await response.body?.cancel().catch(() => undefined)
    return createAiProviderError({
      ...options,
      code: classifyAiProviderStatus(response.status),
      metadata: baseMetadata,
      status: response.status,
    })
  }

  try {
    const body = await readBoundedBody(
      response,
      AI_PROVIDER_RESPONSE_LIMITS.errorBodyBytes,
      options,
    )
    let providerCode: string | undefined
    try {
      providerCode = getSafeProviderCode(
        JSON.parse(decodeUtf8(body.bytes)) as unknown,
      )
    } catch {
      providerCode = undefined
    }
    return createAiProviderError({
      ...options,
      code: classifyAiProviderStatus(response.status),
      metadata: {
        ...baseMetadata,
        observedBytes: body.observedBytes,
        providerCode,
        truncated: false,
      },
      status: response.status,
    })
  } catch (error) {
    if (isAiProviderError(error)) return error
    return createAiProviderError({
      ...options,
      code: 'ai_provider_response_read_failed',
      metadata: baseMetadata,
      status: response.status,
    })
  }
}

export async function readAiProviderJson<T>(
  response: Response,
  options: ProviderResponseOptions,
): Promise<T> {
  const contentTypeCategory = getAiProviderContentTypeCategory(
    response.headers.get('content-type'),
  )
  if (contentTypeCategory !== 'json') {
    await response.body?.cancel().catch(() => undefined)
    throw createAiProviderError({
      ...options,
      code: 'ai_provider_invalid_response',
      metadata: {
        contentTypeCategory,
        upstreamRequestId: getSafeUpstreamRequestId(response.headers),
      },
      status: response.status,
    })
  }

  const body = await readBoundedBody(
    response,
    AI_PROVIDER_RESPONSE_LIMITS.jsonBodyBytes,
    options,
  )
  try {
    return JSON.parse(decodeUtf8(body.bytes)) as T
  } catch {
    throw createAiProviderError({
      ...options,
      code: 'ai_provider_invalid_response',
      metadata: {
        contentTypeCategory,
        observedBytes: body.observedBytes,
        upstreamRequestId: getSafeUpstreamRequestId(response.headers),
      },
      status: response.status,
    })
  }
}
