import { describe, expect, it } from 'vitest'
import { getBrowserLinkUri } from '@/lib/norm-references/browser-link-uri'

describe('getBrowserLinkUri', () => {
  it('returns trimmed http and https URLs', () => {
    expect(getBrowserLinkUri('  https://example.test/reference  ')).toBe(
      'https://example.test/reference',
    )
    expect(getBrowserLinkUri('http://example.test/reference')).toBe(
      'http://example.test/reference',
    )
  })

  it('rejects empty, malformed, and unsupported URI schemes', () => {
    expect(getBrowserLinkUri(null)).toBeNull()
    expect(getBrowserLinkUri('')).toBeNull()
    expect(getBrowserLinkUri('See https://example.test/reference')).toBeNull()
    expect(getBrowserLinkUri('file:///tmp/reference.pdf')).toBeNull()
    expect(getBrowserLinkUri('norm://reference/1')).toBeNull()
  })
})
