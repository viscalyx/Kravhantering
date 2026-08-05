import { beforeEach, describe, expect, it, vi } from 'vitest'

const defineRoutingMock = vi.fn((value: unknown) => value)
const createNavigationMock = vi.fn(() => ({
  getPathname: vi.fn(),
  Link: 'link',
  redirect: vi.fn(),
  usePathname: vi.fn(),
  useRouter: vi.fn(),
}))

vi.mock('next-intl/navigation', () => ({
  createNavigation: createNavigationMock,
}))
vi.mock('next-intl/routing', () => ({
  defineRouting: defineRoutingMock,
}))

describe('i18n routing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('defines Swedish-first navigation for the supported locales', async () => {
    const navigation = await import('@/i18n/routing')

    expect(defineRoutingMock).toHaveBeenCalledWith({
      defaultLocale: 'sv',
      locales: ['sv', 'en'],
    })
    expect(createNavigationMock).toHaveBeenCalledWith(navigation.routing)
    expect(navigation.Link).toBe('link')
    expect(navigation.redirect).toEqual(expect.any(Function))
    expect(navigation.usePathname).toEqual(expect.any(Function))
    expect(navigation.useRouter).toEqual(expect.any(Function))
    expect(navigation.getPathname).toEqual(expect.any(Function))
  })
})
