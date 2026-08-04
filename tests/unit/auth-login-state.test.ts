import { beforeEach, describe, expect, it, vi } from 'vitest'

const loginStateMocks = vi.hoisted(() => ({
  cookies: vi.fn(),
  getIronSession: vi.fn(),
}))

vi.mock('next/headers', () => ({ cookies: loginStateMocks.cookies }))
vi.mock('iron-session', () => ({
  getIronSession: loginStateMocks.getIronSession,
}))
vi.mock('@/lib/auth/config', () => ({
  getAuthConfig: () => ({
    cookieName: 'kravhantering_session',
    cookiePassword: 'a-secure-cookie-password-at-least-32-characters',
  }),
}))

import { getLoginState } from '@/lib/auth/login-state'

describe('login state cookie', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates a short-lived, HTTP-only, same-site login cookie', async () => {
    const cookieStore = { kind: 'request-cookie-store' }
    const session = { save: vi.fn() }
    loginStateMocks.cookies.mockResolvedValue(cookieStore)
    loginStateMocks.getIronSession.mockResolvedValue(session)

    await expect(getLoginState()).resolves.toBe(session)
    expect(loginStateMocks.getIronSession).toHaveBeenCalledWith(cookieStore, {
      cookieName: 'kravhantering_session_login',
      password: 'a-secure-cookie-password-at-least-32-characters',
      ttl: 300,
      cookieOptions: {
        httpOnly: true,
        secure: false,
        sameSite: 'lax',
        path: '/',
      },
    })
  })
})
