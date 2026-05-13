import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AuthExpiryGuard from '@/components/AuthExpiryGuard'
import { AUTH_REAUTH_REQUIRED_EVENT } from '@/lib/auth/client-events'

const authExpiryState = vi.hoisted(() => ({
  confirm: vi.fn(),
  redirectToReauthLogin: vi.fn(),
}))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('@/components/ConfirmModal', () => ({
  useConfirmModal: () => ({ confirm: authExpiryState.confirm }),
}))

vi.mock('@/lib/auth/client-redirect', () => ({
  redirectToReauthLogin: authExpiryState.redirectToReauthLogin,
}))

const fetchMock = vi.fn()

function authMeResponse(expiresAt: number) {
  return {
    ok: true,
    json: async () => ({
      authenticated: true,
      expiresAt,
    }),
  }
}

async function flushPromises() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
  })
}

describe('AuthExpiryGuard', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-13T12:00:00.000Z'))
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.mockReset()
    authExpiryState.confirm.mockReset()
    authExpiryState.redirectToReauthLogin.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('warns two minutes before auth expiry', async () => {
    const expiresAt = Math.floor(Date.now() / 1000) + 180
    fetchMock.mockResolvedValue(authMeResponse(expiresAt))
    authExpiryState.confirm.mockReturnValue(new Promise(() => {}))

    render(<AuthExpiryGuard />)
    await flushPromises()

    await act(async () => {
      vi.advanceTimersByTime(59_999)
    })
    expect(authExpiryState.confirm).not.toHaveBeenCalled()

    await act(async () => {
      vi.advanceTimersByTime(1)
    })
    expect(authExpiryState.confirm).toHaveBeenCalledWith(
      expect.objectContaining({
        cancelText: 'continueSession',
        confirmText: 'reauthenticate',
        message: 'sessionExpiringMessage',
        title: 'sessionExpiringTitle',
      }),
    )
  })

  it('redirects immediately when the user confirms the warning', async () => {
    const expiresAt = Math.floor(Date.now() / 1000) + 180
    fetchMock.mockResolvedValue(authMeResponse(expiresAt))
    authExpiryState.confirm.mockResolvedValueOnce(true)

    render(<AuthExpiryGuard />)
    await flushPromises()

    await act(async () => {
      vi.advanceTimersByTime(60_000)
    })
    await flushPromises()

    expect(authExpiryState.redirectToReauthLogin).toHaveBeenCalledTimes(1)
  })

  it('auto-redirects at auth expiry even when the warning stays open', async () => {
    const expiresAt = Math.floor(Date.now() / 1000) + 180
    fetchMock.mockResolvedValue(authMeResponse(expiresAt))
    authExpiryState.confirm.mockReturnValue(new Promise(() => {}))

    render(<AuthExpiryGuard />)
    await flushPromises()

    await act(async () => {
      vi.advanceTimersByTime(179_999)
    })
    expect(authExpiryState.redirectToReauthLogin).not.toHaveBeenCalled()

    await act(async () => {
      vi.advanceTimersByTime(1)
    })
    expect(authExpiryState.redirectToReauthLogin).toHaveBeenCalledTimes(1)
  })

  it('shows an expired dialog and fallback redirect for already-expired auth', async () => {
    const expiresAt = Math.floor(Date.now() / 1000) - 1
    fetchMock.mockResolvedValue(authMeResponse(expiresAt))
    authExpiryState.confirm.mockReturnValue(new Promise(() => {}))

    render(<AuthExpiryGuard />)
    await flushPromises()

    expect(authExpiryState.confirm).toHaveBeenCalledWith(
      expect.objectContaining({
        confirmText: 'reauthenticate',
        message: 'sessionExpiredMessage',
        showCancel: false,
        title: 'sessionExpiredTitle',
      }),
    )
    expect(authExpiryState.redirectToReauthLogin).not.toHaveBeenCalled()

    await act(async () => {
      vi.advanceTimersByTime(5_000)
    })
    expect(authExpiryState.redirectToReauthLogin).toHaveBeenCalledTimes(1)
  })

  it('uses the expired dialog for auth-required API events', async () => {
    const expiresAt = Math.floor(Date.now() / 1000) + 3_600
    fetchMock.mockResolvedValue(authMeResponse(expiresAt))
    authExpiryState.confirm.mockReturnValue(new Promise(() => {}))

    render(<AuthExpiryGuard />)
    await flushPromises()

    act(() => {
      window.dispatchEvent(
        new CustomEvent(AUTH_REAUTH_REQUIRED_EVENT, {
          detail: { reason: 'api_unauthorized' },
        }),
      )
    })

    expect(authExpiryState.confirm).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'sessionExpiredMessage',
        title: 'sessionExpiredTitle',
      }),
    )
  })
})
