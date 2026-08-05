import { render, screen } from '@testing-library/react'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import {
  getMessages,
  getTranslations,
  setRequestLocale,
} from 'next-intl/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import LocaleLayout, {
  generateMetadata,
  generateStaticParams,
} from '@/app/[locale]/layout'
import LocaleNotFound from '@/app/[locale]/not-found'
import GlobalNotFound from '@/app/not-found'
import RootPage from '@/app/page'
import robots from '@/app/robots'
import sitemap from '@/app/sitemap'

vi.mock('next/headers', () => ({
  headers: vi.fn(),
}))

vi.mock('next-intl/server', () => ({
  getMessages: vi.fn(),
  getTranslations: vi.fn(),
  setRequestLocale: vi.fn(),
}))

vi.mock('next-intl', () => ({
  NextIntlClientProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  useTranslations: () => (key: string) => key,
}))

vi.mock('next-themes', () => ({
  ThemeProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}))

vi.mock('@/i18n/routing', () => ({
  Link: ({ children, href, ...props }: React.ComponentProps<'a'>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
  routing: { defaultLocale: 'sv', locales: ['sv', 'en'] },
}))

vi.mock('@/components/AuthExpiryGuard', () => ({
  default: () => <div>auth expiry guard</div>,
}))
vi.mock('@/components/ConfirmModal', () => ({
  ConfirmModalProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}))
vi.mock('@/components/DeveloperModeProvider', () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))
vi.mock('@/components/Footer', () => ({
  default: () => <footer>footer</footer>,
}))
vi.mock('@/components/HelpPanel', () => ({
  HelpProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}))
vi.mock('@/components/LocaleStorageSync', () => ({
  default: () => <div>locale storage sync</div>,
}))
vi.mock('@/components/Navigation', () => ({
  default: () => <nav>navigation</nav>,
}))
vi.mock('@/components/RootLocaleRedirect', () => ({
  default: ({ defaultLocale }: { defaultLocale: string }) => (
    <div>redirect to {defaultLocale}</div>
  ),
}))
vi.mock('@/components/ThemeRootSync', () => ({
  default: () => <div>theme root sync</div>,
}))
vi.mock('@/lib/build-metadata', () => ({
  readBuildMetadata: () => ({ commitSha: 'test', version: 'test' }),
}))

describe('application shell', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(headers).mockResolvedValue(
      new Headers({
        'x-middleware-request-x-nonce': 'fallback-nonce',
      }) as never,
    )
    vi.mocked(getMessages).mockResolvedValue({ common: {} })
    vi.mocked(getTranslations).mockResolvedValue(
      ((key: string) => `common.${key}`) as never,
    )
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('renders the root providers with the request nonce and application metadata', async () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://shell.test')
    const { default: RootLayout, metadata } = await import('@/app/layout')
    const view = await RootLayout({ children: <p>content</p> })

    render(view, { container: document })

    expect(screen.getByText('theme root sync')).toBeInTheDocument()
    expect(screen.getByText('content')).toBeInTheDocument()
    expect(metadata.metadataBase).toEqual(new URL('https://shell.test'))
    expect(metadata.robots).toEqual({
      follow: false,
      googleBot: { follow: false, index: false },
      index: false,
    })
  })

  it('publishes locale-specific metadata and static locale parameters', async () => {
    const localizedMetadata = await generateMetadata({
      params: Promise.resolve({ locale: 'en' }),
    })

    expect(generateStaticParams()).toEqual([{ locale: 'sv' }, { locale: 'en' }])
    expect(getTranslations).toHaveBeenCalledWith({
      locale: 'en',
      namespace: 'common',
    })
    expect(localizedMetadata).toMatchObject({
      description: 'common.appDescription',
      title: {
        default: 'common.appName',
        template: '%s | common.appName',
      },
    })
  })

  it('falls back to Swedish metadata for an unsupported locale', async () => {
    await generateMetadata({ params: Promise.resolve({ locale: 'de' }) })

    expect(getTranslations).toHaveBeenCalledWith({
      locale: 'sv',
      namespace: 'common',
    })
  })

  it('renders the localized shell and initializes the requested locale', async () => {
    const view = await LocaleLayout({
      children: <p>localized content</p>,
      params: Promise.resolve({ locale: 'en' }),
    })

    render(view)

    expect(setRequestLocale).toHaveBeenCalledWith('en')
    expect(getMessages).toHaveBeenCalledWith({ locale: 'en' })
    expect(screen.getByRole('navigation')).toBeInTheDocument()
    expect(screen.getByText('localized content')).toBeInTheDocument()
    expect(screen.getByRole('contentinfo')).toBeInTheDocument()
  })

  it('rejects an unsupported localized shell route', async () => {
    vi.mocked(notFound).mockImplementationOnce(() => {
      throw new Error('not found')
    })

    await expect(
      LocaleLayout({
        children: null,
        params: Promise.resolve({ locale: 'de' }),
      }),
    ).rejects.toThrow('not found')
  })

  it('renders the root redirect and both not-found recovery links', () => {
    const { rerender } = render(<RootPage />)
    expect(screen.getByText('redirect to sv')).toBeInTheDocument()

    rerender(<GlobalNotFound />)
    expect(screen.getByRole('heading', { name: '404' })).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Gå till startsidan' }),
    ).toHaveAttribute('href', '/sv')

    rerender(<LocaleNotFound />)
    expect(screen.getByRole('link', { name: 'goHome' })).toHaveAttribute(
      'href',
      '/requirements',
    )
  })

  it('publishes only locale landing pages to crawlers', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://example.test///')

    expect(robots()).toEqual({
      rules: [{ disallow: '/', userAgent: '*' }],
    })
    const entries = sitemap()
    expect(entries.map(entry => entry.url)).toEqual([
      'https://example.test/sv',
      'https://example.test/en',
    ])
    expect(entries.every(entry => entry.lastModified instanceof Date)).toBe(
      true,
    )
  })

  it('fails sitemap generation when the public site URL is missing', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', '')

    expect(() => sitemap()).toThrow('NEXT_PUBLIC_SITE_URL is not set')
  })
})
