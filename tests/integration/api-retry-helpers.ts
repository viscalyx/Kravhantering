import { delay } from '@/tests/helpers/common'
import {
  type ApiResponseLike,
  apiResponseFailureMessage,
} from './api-response-assertions'

export type RetryableApiResponse = ApiResponseLike

interface ApiResponseRetryOptions {
  attempts?: number
  retryDelayMs?: (attemptIndex: number) => number
  shouldRetryStatus?: (status: number) => boolean
}

const DEFAULT_RETRY_ATTEMPTS = 4

function defaultRetryDelayMs(attemptIndex: number) {
  return 750 * (attemptIndex + 1)
}

export async function expectApiResponseOkWithRetry<
  TResponse extends RetryableApiResponse,
>(
  label: string,
  request: () => Promise<TResponse>,
  options: ApiResponseRetryOptions = {},
): Promise<TResponse> {
  const attempts = Math.max(1, options.attempts ?? DEFAULT_RETRY_ATTEMPTS)
  const retryDelayMs = options.retryDelayMs ?? defaultRetryDelayMs
  const shouldRetryStatus =
    options.shouldRetryStatus ?? ((status: number) => status >= 500)
  let lastFailure = 'unknown failure'

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    let response: TResponse
    try {
      response = await request()
    } catch (error) {
      lastFailure = error instanceof Error ? error.message : String(error)
      if (attempt === attempts - 1) {
        throw new Error(`${label} failed after retries: ${lastFailure}`)
      }
      await delay(retryDelayMs(attempt))
      continue
    }

    if (response.ok()) return response

    lastFailure = await apiResponseFailureMessage(response)
    if (!shouldRetryStatus(response.status())) {
      throw new Error(`${label} returned ${lastFailure}`)
    }
    if (attempt === attempts - 1) {
      throw new Error(`${label} failed after retries: ${lastFailure}`)
    }
    await delay(retryDelayMs(attempt))
  }

  throw new Error(`${label} failed after retries: ${lastFailure}`)
}
