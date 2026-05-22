import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import AuthErrorPage from '@/app/auth/error/page'

describe('auth error page', () => {
  it('renders the localized login-state cookie failure and retry link', async () => {
    render(
      await AuthErrorPage({
        searchParams: Promise.resolve({
          code: 'login_state_cookie_missing',
          locale: 'sv',
        }),
      }),
    )

    expect(
      screen.getByRole('heading', {
        name: 'Inloggningen kunde inte slutföras',
      }),
    ).toBeInTheDocument()
    expect(screen.getByText('login_state_cookie_missing')).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Försök logga in igen' }),
    ).toHaveAttribute(
      'href',
      `/api/auth/login?returnTo=${encodeURIComponent('/sv/requirements')}`,
    )
  })

  it('uses generic English copy for other callback failures', async () => {
    render(
      await AuthErrorPage({
        searchParams: Promise.resolve({
          code: 'token_exchange_failed',
          locale: 'en',
        }),
      }),
    )

    expect(
      screen.getByRole('heading', {
        name: 'Sign-in could not be completed',
      }),
    ).toBeInTheDocument()
    expect(screen.getByText('token_exchange_failed')).toBeInTheDocument()
    expect(
      screen.getByText(/The sign-in callback could not be completed/),
    ).toBeInTheDocument()
  })
})
