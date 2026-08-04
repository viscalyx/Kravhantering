import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildReauthLoginHref,
  redirectToReauthLogin,
} from '@/lib/auth/client-redirect'

describe('auth client redirect helpers', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/sv/requirements')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('preserves current path, query, and hash in login returnTo', () => {
    window.history.replaceState({}, '', '/sv/requirements?tab=open#section-2')

    expect(buildReauthLoginHref()).toBe(
      `/api/auth/login?returnTo=${encodeURIComponent('/sv/requirements?tab=open#section-2')}`,
    )
  })

  it('navigates to login with the current page as returnTo', () => {
    const assign = vi.fn()
    vi.stubGlobal('window', {
      location: {
        pathname: '/sv/requirements',
        search: '?tab=open',
        hash: '#row-2',
        assign,
      },
    })

    redirectToReauthLogin()

    expect(assign).toHaveBeenCalledWith(
      `/api/auth/login?returnTo=${encodeURIComponent('/sv/requirements?tab=open#row-2')}`,
    )
  })

  it('uses a safe root return path without a browser window', () => {
    vi.stubGlobal('window', undefined)

    expect(buildReauthLoginHref()).toBe('/api/auth/login?returnTo=%2F')
    expect(() => redirectToReauthLogin()).not.toThrow()
  })

  it('normalizes an empty browser location to the root path', () => {
    vi.stubGlobal('window', {
      location: { pathname: '', search: '', hash: '' },
    })

    expect(buildReauthLoginHref()).toBe('/api/auth/login?returnTo=%2F')
  })
})
