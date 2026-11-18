import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'
import { describe, expect, it } from 'vitest'
import SkipToMainContent from '@/components/SkipToMainContent'
import en from '@/messages/en.json'
import sv from '@/messages/sv.json'

describe('SkipToMainContent', () => {
  it.each([
    ['en', en, 'Skip to main content'],
    ['sv', sv, 'Hoppa till huvudinnehållet'],
  ] as const)(
    'bypasses navigation in %s without leaving a focusable container',
    async (locale, messages, label) => {
      const user = userEvent.setup()
      render(
        <NextIntlClientProvider
          locale={locale}
          messages={messages}
          timeZone="UTC"
        >
          <SkipToMainContent />
          <nav>
            <button type="button">Navigation control</button>
          </nav>
          <main id="main-content">
            <button type="button">Content control</button>
          </main>
        </NextIntlClientProvider>,
      )

      await user.tab()
      expect(screen.getByRole('link', { name: label })).toHaveFocus()
      await user.keyboard('{Enter}')
      expect(screen.getByRole('main')).toHaveFocus()
      await user.tab()
      expect(
        screen.getByRole('button', { name: 'Content control' }),
      ).toHaveFocus()
      expect(screen.getByRole('main')).not.toHaveAttribute('tabindex')
    },
  )

  it('restores pointer navigation when content is clicked before the next Tab', async () => {
    const user = userEvent.setup()
    render(
      <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
        <SkipToMainContent />
        <main id="main-content">
          <p>Page text</p>
        </main>
      </NextIntlClientProvider>,
    )

    await user.click(screen.getByRole('link', { name: 'Skip to main content' }))
    expect(screen.getByRole('main')).toHaveFocus()
    await user.click(screen.getByText('Page text'))
    expect(screen.getByRole('main')).not.toHaveAttribute('tabindex')
  })

  it('retains the native fragment link when its target is unavailable', async () => {
    const user = userEvent.setup()
    render(
      <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
        <SkipToMainContent />
      </NextIntlClientProvider>,
    )
    const link = screen.getByRole('link', { name: 'Skip to main content' })
    await user.click(link)
    expect(link).toHaveFocus()
    expect(link).toHaveAttribute('href', '#main-content')
  })
})
