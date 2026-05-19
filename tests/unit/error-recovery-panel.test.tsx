import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import LocaleError from '@/app/[locale]/error'
import RootError from '@/app/error'
import GlobalError from '@/app/global-error'
import ErrorRecoveryPanel from '@/components/ErrorRecoveryPanel'
import { getErrorRecoveryCopy } from '@/lib/error-boundary-recovery'

const pathnameState = vi.hoisted(() => ({
  value: '/en/requirements',
}))

const localeState = vi.hoisted(() => ({
  value: 'en',
}))

const localeMessages = vi.hoisted(() => ({
  en: {
    description:
      'The page could not be rendered. Try again or go back to a safe starting point.',
    eyebrow: 'Unexpected error',
    goToAdmin: 'Go to admin',
    goToCatalog: 'Go to requirements library',
    referenceLabel: 'Error reference',
    retry: 'Try again',
    title: 'Something went wrong',
  },
  sv: {
    description:
      'Sidan kunde inte visas. Försök igen eller gå tillbaka till en säker startsida.',
    eyebrow: 'Oväntat fel',
    goToAdmin: 'Gå till administration',
    goToCatalog: 'Gå till kravbiblioteket',
    referenceLabel: 'Felreferens',
    retry: 'Försök igen',
    title: 'Något gick fel',
  },
}))

vi.mock('next/navigation', () => ({
  usePathname: () => pathnameState.value,
}))

vi.mock('next-intl', () => ({
  useLocale: () => localeState.value,
  useTranslations: () => (key: keyof (typeof localeMessages)['en']) =>
    localeMessages[localeState.value as 'en' | 'sv'][key],
}))

function makeError(
  message = 'internal connection string leaked',
  digest?: string,
) {
  return Object.assign(new Error(message), digest ? { digest } : {})
}

describe('ErrorRecoveryPanel', () => {
  beforeEach(() => {
    pathnameState.value = '/en/requirements'
    localeState.value = 'en'
    vi.clearAllMocks()
  })

  it('renders English fallback copy, retry, digest, and library-first links', async () => {
    const retry = vi.fn()
    const user = userEvent.setup()

    render(
      <ErrorRecoveryPanel
        copy={getErrorRecoveryCopy('en')}
        error={makeError('do not show this raw message', 'digest-123')}
        locale="en"
        onRetry={retry}
        pathname="/en/requirements/REQ-001"
        surface="unit"
      />,
    )

    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Something went wrong' }),
    ).toBeInTheDocument()
    expect(screen.queryByText('do not show this raw message')).toBeNull()
    expect(screen.getByText('digest-123')).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Go to requirements library' }),
    ).toHaveAttribute('href', '/en/requirements')
    expect(screen.getByRole('link', { name: 'Go to admin' })).toHaveAttribute(
      'href',
      '/en/admin',
    )

    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(retry).toHaveBeenCalledOnce()
  })

  it('renders Swedish fallback copy and admin-first links for admin paths', () => {
    render(
      <ErrorRecoveryPanel
        copy={getErrorRecoveryCopy('sv')}
        error={makeError()}
        locale="sv"
        onRetry={vi.fn()}
        pathname="/sv/admin"
        surface="unit"
      />,
    )

    expect(
      screen.getByRole('heading', { name: 'Något gick fel' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Gå till administration' }),
    ).toHaveAttribute('href', '/sv/admin')
    expect(
      screen.getByRole('link', { name: 'Gå till kravbiblioteket' }),
    ).toHaveAttribute('href', '/sv/requirements')
  })
})

describe('App Router error boundaries', () => {
  beforeEach(() => {
    pathnameState.value = '/en/requirements'
    localeState.value = 'en'
    vi.clearAllMocks()
  })

  it('uses localized next-intl copy in the locale boundary', async () => {
    const unstableRetry = vi.fn()
    const user = userEvent.setup()
    pathnameState.value = '/sv/admin/error-boundary-test'
    localeState.value = 'sv'

    render(
      <LocaleError
        error={makeError('hidden localized error')}
        reset={vi.fn()}
        unstable_retry={unstableRetry}
      />,
    )

    expect(
      screen.getByRole('heading', { name: 'Något gick fel' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Gå till administration' }),
    ).toHaveAttribute('href', '/sv/admin')
    expect(screen.queryByText('hidden localized error')).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Försök igen' }))
    expect(unstableRetry).toHaveBeenCalledOnce()
  })

  it('uses locale-prefixed safe links in the root boundary', () => {
    pathnameState.value = '/en/admin/error-boundary-test'

    render(<RootError error={makeError()} reset={vi.fn()} />)

    expect(
      screen.getByRole('heading', { name: 'Something went wrong' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Go to admin' })).toHaveAttribute(
      'href',
      '/en/admin',
    )
    expect(
      screen.getByRole('link', { name: 'Go to requirements library' }),
    ).toHaveAttribute('href', '/en/requirements')
  })

  it('uses locale-prefixed safe links in the global boundary', () => {
    pathnameState.value = '/sv/requirements'

    const markup = renderToStaticMarkup(
      <GlobalError error={makeError()} reset={vi.fn()} />,
    )

    expect(markup).toContain('lang="sv"')
    expect(markup).toContain('Något gick fel')
    expect(markup).toContain('href="/sv/requirements"')
    expect(markup).toContain('href="/sv/admin"')
  })
})
