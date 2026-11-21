type LocaleChangeQuery = (params: URLSearchParams) => URLSearchParams

let activeRoute: { pathname: string; getQuery: LocaleChangeQuery } | undefined

/** Let the mounted page supply deep-link parameters for its current task. */
export function registerLocaleChangeQuery(
  pathname: string,
  getQuery: LocaleChangeQuery,
): () => void {
  const route = { pathname, getQuery }
  activeRoute = route
  return () => {
    if (activeRoute === route) activeRoute = undefined
  }
}

/** Combine next-intl's locale-neutral path with this tab's live URL context. */
export function getLocaleChangeHref(pathname: string): string {
  const url = new URL(window.location.href)
  if (activeRoute?.pathname === pathname) {
    url.search = activeRoute.getQuery(url.searchParams).toString()
  }
  return pathname + url.search + url.hash
}
