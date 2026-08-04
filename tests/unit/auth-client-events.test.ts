import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  AUTH_REAUTH_REQUIRED_EVENT,
  dispatchAuthReauthRequired,
} from '@/lib/auth/client-events'

describe('auth reauthentication events', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('dispatches the current authentication failure reason', () => {
    const listener = vi.fn()
    window.addEventListener(AUTH_REAUTH_REQUIRED_EVENT, listener)

    dispatchAuthReauthRequired('session_expired')

    expect(listener).toHaveBeenCalledOnce()
    const event = listener.mock.calls[0][0] as CustomEvent
    expect(event.detail).toEqual({
      reason: 'session_expired',
    })
    window.removeEventListener(AUTH_REAUTH_REQUIRED_EVENT, listener)
  })

  it('is a no-op during server rendering', () => {
    vi.stubGlobal('window', undefined)
    expect(() => dispatchAuthReauthRequired('session_missing')).not.toThrow()
  })

  it.each([new Error('dispatch failed'), 'dispatch failed'])(
    'logs dispatch failures without throwing for %p',
    failure => {
      vi.spyOn(window, 'dispatchEvent').mockImplementation(() => {
        throw failure
      })
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      expect(() => dispatchAuthReauthRequired('api_unauthorized')).not.toThrow()
      expect(errorSpy).toHaveBeenCalledWith(
        '[auth] failed to dispatch auth-required event',
        failure instanceof Error ? failure.message : String(failure),
      )
    },
  )

  it('still protects callers when both dispatch and error logging fail', () => {
    vi.spyOn(window, 'dispatchEvent').mockImplementation(() => {
      throw new Error('dispatch failed')
    })
    vi.spyOn(console, 'error').mockImplementation(() => {
      throw new Error('console failed')
    })

    expect(() => dispatchAuthReauthRequired('session_missing')).not.toThrow()
  })
})
