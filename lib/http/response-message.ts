function getResponseMessage(body: unknown): string | null {
  if (typeof body === 'string') {
    const trimmed = body.trim()
    return trimmed.length > 0 ? trimmed : null
  }

  if (body && typeof body === 'object') {
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
): Promise<string | null> {
  const contentType =
    response.headers?.get?.('content-type')?.toLowerCase() ?? ''

  if (contentType.includes('application/json')) {
    return getResponseMessage(await response.json().catch(() => null))
  }

  if (typeof response.text === 'function') {
    const text = (await response.text().catch(() => '')).trim()
    if (text.length > 0) {
      try {
        return getResponseMessage(JSON.parse(text)) ?? text
      } catch {
        return getResponseMessage(text) ?? text
      }
    }
  }

  if (typeof response.json === 'function') {
    return getResponseMessage(await response.json().catch(() => null))
  }

  return null
}
