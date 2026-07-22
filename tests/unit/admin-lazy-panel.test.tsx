import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import AdminLazyPanel from '@/app/[locale]/admin/admin-lazy-panel'

vi.mock('next-intl', () => ({
  useTranslations:
    (namespace?: string) => (key: string, values?: Record<string, unknown>) =>
      `${namespace ? `${namespace}.` : ''}${key}${
        values ? ` ${Object.values(values).join(' ')}` : ''
      }`,
}))

function SuspendedPanel(): never {
  throw new Promise(() => undefined)
}

function BrokenPanel(): never {
  throw new Error('panel import failed')
}

describe('AdminLazyPanel', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders an accessible, panel-local loading state', () => {
    render(
      <AdminLazyPanel tabId="identity" tabLabel="admin.identity.title">
        <SuspendedPanel />
      </AdminLazyPanel>,
    )

    expect(screen.getByRole('status')).toHaveTextContent(
      'admin.panelLoading admin.identity.title',
    )
    expect(screen.getByRole('tabpanel')).toHaveAttribute(
      'data-developer-mode-name',
      'panel loading',
    )
  })

  it('contains a panel failure and offers an accessible reload action', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)

    render(
      <AdminLazyPanel tabId="identity" tabLabel="admin.identity.title">
        <BrokenPanel />
      </AdminLazyPanel>,
    )

    expect(screen.getByRole('alert')).toHaveTextContent(
      'admin.panelLoadError.title admin.identity.title',
    )
    expect(
      screen.getByRole('button', { name: 'admin.panelLoadError.retry' }),
    ).toBeVisible()
    expect(screen.getByRole('tabpanel')).toHaveAttribute(
      'data-developer-mode-name',
      'panel load error',
    )
  })
})
