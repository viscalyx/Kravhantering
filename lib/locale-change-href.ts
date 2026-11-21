type LocaleChangeQuery = (params: URLSearchParams) => void

let activeRoute: { pathname: string; addQuery: LocaleChangeQuery } | undefined

/** Let the mounted page supply deep-link parameters for its current task. */
export function registerLocaleChangeQuery(
  pathname: string,
  addQuery: LocaleChangeQuery,
): () => void {
  const route = { pathname, addQuery }
  activeRoute = route
  return () => {
    if (activeRoute === route) activeRoute = undefined
  }
}

/** Combine next-intl's locale-neutral path with this tab's live URL context. */
export function getLocaleChangeHref(pathname: string): string {
  const url = new URL(window.location.href)
  if (activeRoute?.pathname === pathname) activeRoute.addQuery(url.searchParams)
  return pathname + url.search + url.hash
}
