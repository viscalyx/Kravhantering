import type { MetadataRoute } from 'next'

export const dynamic = 'force-static'

/**
 * `/robots.txt` — disallow all crawlers. The Kravhantering app is an
 * internal/auth-gated tool with no public content; serving an explicit
 * `Disallow: /` keeps automated indexers (and ZAP rule 10109's HTML
 * heuristic on a Next.js 404 fallback — issue #108) away from the site.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', disallow: '/' }],
  }
}
