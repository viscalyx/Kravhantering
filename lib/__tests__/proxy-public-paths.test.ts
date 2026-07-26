import { describe, expect, it } from 'vitest'
import {
  isReviewedProxyBypassPath,
  REVIEWED_PROXY_BYPASS_EXACT_PATHS,
  REVIEWED_PROXY_BYPASS_PREFIXES,
} from '@/lib/auth/proxy-public-paths'

describe('proxy public paths', () => {
  it.each(REVIEWED_PROXY_BYPASS_EXACT_PATHS)(
    'recognizes reviewed exact path %s',
    path => {
      expect(isReviewedProxyBypassPath(path)).toBe(true)
    },
  )

  it.each(REVIEWED_PROXY_BYPASS_PREFIXES)(
    'recognizes descendants of reviewed prefix %s',
    prefix => {
      expect(isReviewedProxyBypassPath(`${prefix}chunks/app.js`)).toBe(true)
    },
  )

  it.each([
    '/_next/images',
    '/_next/static-files/chunks/app.js',
    '/api-docs/hsa-person-lookup/swagger-ui.css.map',
    '/build.json/preview',
    '/favicon.ico/preview',
    '/logo-small.png.backup',
    '/robots.txt/preview',
    '/sitemap.xml.bak',
  ])('keeps near-miss path %s behind the proxy', path => {
    expect(isReviewedProxyBypassPath(path)).toBe(false)
  })
})
