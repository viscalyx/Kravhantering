import { describe, expect, it } from 'vitest'

describe('i18n routing', () => {
  it('builds localized paths from the Swedish-first routing contract', async () => {
    const navigation = await import('@/i18n/routing')

    expect(navigation.routing).toEqual({
      defaultLocale: 'sv',
      locales: ['sv', 'en'],
    })
    expect(
      navigation.getPathname({ href: '/requirements', locale: 'sv' }),
    ).toBe('/sv/requirements')
    expect(
      navigation.getPathname({ href: '/requirements', locale: 'en' }),
    ).toBe('/en/requirements')
  })
})
