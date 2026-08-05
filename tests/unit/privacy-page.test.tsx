import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  getSession: vi.fn(),
  getTranslations: vi.fn(),
  isSignedIn: vi.fn(),
}))

vi.mock('@/lib/auth/session', () => ({
  getSession: state.getSession,
  isSignedIn: state.isSignedIn,
}))
vi.mock('@/i18n/routing', () => ({
  routing: { defaultLocale: 'sv', locales: ['sv', 'en'] },
}))
vi.mock('next-intl/server', () => ({ getTranslations: state.getTranslations }))

describe('privacy page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.getTranslations.mockResolvedValue((key: string) => key)
  })

  it('projects only a signed-in user into the privacy client', async () => {
    state.getSession.mockResolvedValue({
      email: 'ada@example.test',
      hsaId: 'SE5560000001-ada1',
      name: 'Ada Admin',
    })
    state.isSignedIn.mockReturnValue(true)
    const { default: PrivacyPage, generateMetadata } = await import(
      '@/app/[locale]/privacy/page'
    )
    expect(
      await generateMetadata({
        params: Promise.resolve({ locale: 'invalid' }),
      }),
    ).toEqual({ title: 'title' })
    expect(
      await generateMetadata({ params: Promise.resolve({ locale: 'en' }) }),
    ).toEqual({ title: 'title' })
    expect((await PrivacyPage()).props.currentUser).toEqual({
      email: 'ada@example.test',
      hsaId: 'SE5560000001-ada1',
      name: 'Ada Admin',
    })

    state.getSession.mockResolvedValue({
      hsaId: 'SE5560000001-ada1',
      name: 'Ada Admin',
    })
    expect((await PrivacyPage()).props.currentUser).toEqual({
      hsaId: 'SE5560000001-ada1',
      name: 'Ada Admin',
    })

    state.isSignedIn.mockReturnValue(false)
    expect((await PrivacyPage()).props.currentUser).toBeNull()
  })
})
