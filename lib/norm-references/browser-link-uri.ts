export function getBrowserLinkUri(
  uri: string | null | undefined,
): string | null {
  const trimmedUri = uri?.trim()
  if (!trimmedUri) return null

  try {
    const parsedUri = new URL(trimmedUri)
    return parsedUri.protocol === 'http:' || parsedUri.protocol === 'https:'
      ? trimmedUri
      : null
  } catch {
    return null
  }
}
