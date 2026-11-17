import en from '@/messages/en.json'
import sv from '@/messages/sv.json'

export function getResponseMessage(
  body: unknown,
  locale: 'sv' | 'en' = typeof document !== 'undefined' &&
  document.documentElement.lang === 'sv'
    ? 'sv'
    : 'en',
  response?: Response,
): string | null {
  if (typeof body === 'string') {
    const trimmed = body.trim()
    return trimmed.length > 0 ? trimmed : null
  }

  if (body && typeof body === 'object') {
    const failure = body as {
      code?: unknown
      correlationId?: unknown
      timestamp?: unknown
    }
    if (failure.code === 'sql_failure') {
      const reference =
        failure.correlationId ?? response?.headers?.get?.('x-correlation-id')
      if (
        typeof reference === 'string' &&
        /^[A-Za-z0-9._:@/-]{1,128}$/.test(reference) &&
        typeof failure.timestamp === 'string' &&
        /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(failure.timestamp)
      ) {
        return (locale === 'sv' ? sv.common.sqlFailure : en.common.sqlFailure)
          .replace('{reference}', reference)
          .replace('{timestamp}', failure.timestamp)
      }
    }
    const error = (body as { error?: unknown }).error
    if (typeof error === 'string' && error.trim().length > 0) {
      return error.trim()
    }

    const message = (body as { message?: unknown }).message
    if (typeof message === 'string' && message.trim().length > 0) {
      return message.trim()
    }
  }

  return null
}

export async function readResponseMessage(
  response: Response,
  locale: 'sv' | 'en' = typeof document !== 'undefined' &&
  document.documentElement.lang === 'sv'
    ? 'sv'
    : 'en',
): Promise<string | null> {
  const contentType =
    response.headers?.get?.('content-type')?.toLowerCase() ?? ''

  if (contentType.includes('application/json')) {
    return getResponseMessage(
      await response.json().catch(() => null),
      locale,
      response,
    )
  }

  if (typeof response.text === 'function') {
    const text = (await response.text().catch(() => '')).trim()
    if (text.length > 0) {
      try {
        return getResponseMessage(JSON.parse(text), locale, response) ?? text
      } catch {
        return getResponseMessage(text, locale, response) ?? text
      }
    }
  }

  if (typeof response.json === 'function') {
    return getResponseMessage(
      await response.json().catch(() => null),
      locale,
      response,
    )
  }

  return null
}
