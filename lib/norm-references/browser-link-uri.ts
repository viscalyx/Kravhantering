const BROWSER_LINK_URI_PATTERN = /^[A-Za-z][A-Za-z0-9+.-]*:\/\//

export function getBrowserLinkUri(uri: string | null | undefined) {
  const trimmedUri = uri?.trim()
  if (!trimmedUri) return null

  return BROWSER_LINK_URI_PATTERN.test(trimmedUri) ? trimmedUri : null
}
