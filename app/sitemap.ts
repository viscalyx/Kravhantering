import type { MetadataRoute } from 'next'
import { routing } from '@/i18n/routing'

export const dynamic = 'force-static'

// Configured per-environment via `.env*` (see .env.example). Required —
// we deliberately do not provide a fallback so that a missing value fails
// loudly at build/boot rather than silently emitting wrong absolute URLs.
function getSiteUrl(): string {
  const value = process.env.NEXT_PUBLIC_SITE_URL
  if (!value) {
    throw new Error(
      'NEXT_PUBLIC_SITE_URL is not set. Add it to your .env file (see .env.example).',
    )
  }
  // Strip a trailing slash so callers can safely concatenate `/<path>`
  // without producing accidental `//` segments.
  return value.replace(/\/+$/, '')
}

/**
 * `/sitemap.xml` — lists only the locale landing pages. All content
 * URLs require authentication and must never appear in a public
 * sitemap. Adding this route also stops Next.js from serving its
 * SPA-style 404 HTML for `/sitemap.xml`, which removes the URL from
 * ZAP rule 10109 ("Modern Web Application") — issue #108.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = getSiteUrl()
  const lastModified = new Date()
  return routing.locales.map(locale => ({
    url: `${siteUrl}/${locale}`,
    lastModified,
    changeFrequency: 'monthly' as const,
    priority: 0.5,
  }))
}
