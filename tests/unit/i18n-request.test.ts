import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next-intl/server', () => ({
  getRequestConfig: (factory: unknown) => factory,
}))

vi.mock('@/i18n/routing', () => ({
  routing: {
    defaultLocale: 'sv',
    locales: ['sv', 'en'],
  },
}))

describe('i18n request config', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('loads static messages for a supported request locale', async () => {
    const getRequestConfig = (await import('@/i18n/request')).default as ({
      requestLocale,
    }: {
      requestLocale: Promise<string>
    }) => Promise<{ locale: string; messages: Record<string, unknown> }>

    const result = await getRequestConfig({
      requestLocale: Promise.resolve('en'),
    })

    expect(result.locale).toBe('en')
    expect(result.messages).toMatchObject({
      nav: expect.objectContaining({
        catalog: 'Requirements Library',
      }),
    })
  })

  it('falls back to the default static locale for unsupported locales', async () => {
    const getRequestConfig = (await import('@/i18n/request')).default as ({
      requestLocale,
    }: {
      requestLocale: Promise<string | undefined>
    }) => Promise<{ locale: string; messages: Record<string, unknown> }>

    const result = await getRequestConfig({
      requestLocale: Promise.resolve('de'),
    })

    expect(result.locale).toBe('sv')
    expect(result.messages).toMatchObject({
      nav: expect.objectContaining({
        catalog: 'Kravbibliotek',
      }),
    })
  })
})
