export function extractErrorDetails(rawDetails: string): string {
  if (!rawDetails) {
    return ''
  }

  try {
    const parsed = JSON.parse(rawDetails) as unknown
    if (typeof parsed === 'object' && parsed !== null) {
      const details =
        (parsed as { error?: unknown }).error ??
        (parsed as { message?: unknown }).message
      if (typeof details === 'string' && details.trim()) {
        return details.trim()
      }
    }
  } catch {
    // Fall through to the raw response text when the body is not JSON.
  }

  return rawDetails
}
