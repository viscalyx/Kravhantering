import { describe, expect, it, vi } from 'vitest'

vi.mock('next-intl/navigation', () => ({
  createNavigation: () => ({
    getPathname: () => '/sv/requirements',
    Link: () => null,
    redirect: () => undefined,
    usePathname: () => '/requirements',
    useRouter: () => ({ replace: () => undefined }),
  }),
}))
vi.mock('next-intl/routing', () => ({
  defineRouting: (value: unknown) => value,
}))

describe('i18n routing', () => {
  it('exports Swedish-first routing and localized navigation surfaces', async () => {
    const navigation = await import('@/i18n/routing')

    expect(navigation.routing).toEqual({
      defaultLocale: 'sv',
      locales: ['sv', 'en'],
    })
    expect(navigation.Link).toEqual(expect.any(Function))
    expect(navigation.redirect).toEqual(expect.any(Function))
    expect(navigation.usePathname).toEqual(expect.any(Function))
    expect(navigation.useRouter).toEqual(expect.any(Function))
    expect(navigation.getPathname).toEqual(expect.any(Function))
  })
})
