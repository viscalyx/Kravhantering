/**
 * Exact paths reviewed to bypass proxy execution and authentication.
 *
 * Keep these paths aligned with the literal matcher in `proxy.ts`. The matcher
 * cannot consume this inventory because Next.js must statically analyze it.
 */
export const REVIEWED_PROXY_BYPASS_EXACT_PATHS = [
  '/_next/image',
  '/_next/static',
  '/_next/webpack-hmr',
  '/api-docs/hsa-person-lookup',
  '/api-docs/hsa-person-lookup/',
  '/api-docs/hsa-person-lookup/favicon-16x16.png',
  '/api-docs/hsa-person-lookup/favicon-32x32.png',
  '/api-docs/hsa-person-lookup/hsa-person-lookup.yaml',
  '/api-docs/hsa-person-lookup/index.html',
  '/api-docs/hsa-person-lookup/swagger-ui-bundle.js',
  '/api-docs/hsa-person-lookup/swagger-ui-standalone-preset.js',
  '/api-docs/hsa-person-lookup/swagger-ui.css',
  '/build.json',
  '/favicon.ico',
  '/logo-small.png',
  '/robots.txt',
  '/sitemap.xml',
] as const

/**
 * Path prefixes reviewed to bypass proxy execution and authentication.
 *
 * Prefixes include their trailing slash so similarly named paths remain behind
 * the proxy.
 */
export const REVIEWED_PROXY_BYPASS_PREFIXES = ['/_next/static/'] as const

const reviewedProxyBypassExactPaths: ReadonlySet<string> = new Set(
  REVIEWED_PROXY_BYPASS_EXACT_PATHS,
)

export function isReviewedProxyBypassPath(pathname: string): boolean {
  return (
    reviewedProxyBypassExactPaths.has(pathname) ||
    REVIEWED_PROXY_BYPASS_PREFIXES.some(prefix => pathname.startsWith(prefix))
  )
}
