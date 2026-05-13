import { beforeEach, describe, expect, it } from 'vitest'
import { buildReauthLoginHref } from '@/lib/auth/client-redirect'

describe('auth client redirect helpers', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/sv/requirements')
  })

  it('preserves current path, query, and hash in login returnTo', () => {
    window.history.replaceState({}, '', '/sv/requirements?tab=open#section-2')

    expect(buildReauthLoginHref()).toBe(
      `/api/auth/login?returnTo=${encodeURIComponent('/sv/requirements?tab=open#section-2')}`,
    )
  })
})
