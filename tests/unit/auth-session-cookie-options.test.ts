import { beforeEach, describe, expect, it, vi } from 'vitest'

const sessionMocks = vi.hoisted(() => ({
  cookies: vi.fn(),
  getIronSession: vi.fn(),
  sealData: vi.fn(),
}))

vi.mock('next/headers', () => ({ cookies: sessionMocks.cookies }))
vi.mock('iron-session', () => ({
  getIronSession: sessionMocks.getIronSession,
  sealData: sessionMocks.sealData,
}))
vi.mock('@/lib/auth/config', () => ({
  getAuthConfig: () => ({
    cookieName: 'kravhantering_session',
    cookiePassword: 'a-secure-cookie-password-at-least-32-characters',
    sessionTtlSeconds: 0,
  }),
}))
vi.mock('@/lib/runtime/build-target', () => ({
  USE_INSECURE_COOKIE: false,
}))

import {
  estimateSerializedSessionCookieLength,
  getSession,
} from '@/lib/auth/session'

describe('production session cookie options', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reads the request cookie store with production-secure options', async () => {
    const cookieStore = { kind: 'request-cookie-store' }
    const session = { save: vi.fn() }
    sessionMocks.cookies.mockResolvedValue(cookieStore)
    sessionMocks.getIronSession.mockResolvedValue(session)

    await expect(getSession()).resolves.toBe(session)
    expect(sessionMocks.getIronSession).toHaveBeenCalledWith(cookieStore, {
      cookieName: 'kravhantering_session',
      password: 'a-secure-cookie-password-at-least-32-characters',
      ttl: 0,
      cookieOptions: {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        path: '/',
      },
    })
  })

  it('uses iron-session unlimited-TTL max age and secure serialization', async () => {
    sessionMocks.sealData.mockResolvedValue('sealed-session')

    const length = await estimateSerializedSessionCookieLength({
      sub: 'user-1',
    })

    expect(length).toBe(
      [
        'kravhantering_session=sealed-session',
        'Max-Age=2147483647',
        'Path=/',
        'HttpOnly',
        'Secure',
        'SameSite=Lax',
      ].join('; ').length,
    )
  })
})
