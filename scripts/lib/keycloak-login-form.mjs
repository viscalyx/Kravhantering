export function decodeHtmlEntities(value) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#x2F;/g, '/')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

export function extractKeycloakLoginFormAction(loginHtml) {
  const formTagMatch = loginHtml.match(
    /<form\b[^>]*\bid="kc-form-login"[^>]*>/i,
  )
  const strictAction = formTagMatch?.[0].match(/\baction="([^"]+)"/i)?.[1]
  if (strictAction) return decodeHtmlEntities(strictAction)

  const fallbackAction = loginHtml.match(
    /<form\b[^>]*\baction="([^"]+)"[^>]*>/i,
  )?.[1]
  return fallbackAction ? decodeHtmlEntities(fallbackAction) : undefined
}

export function describeKeycloakLoginFormActionError(loginPageUrl) {
  return (
    `Could not locate Keycloak login form action at ${loginPageUrl}. ` +
    'Expected the default Keycloak form id "kc-form-login"; a custom ' +
    'Keycloak realm theme that changes or removes that form is the likely cause.'
  )
}
