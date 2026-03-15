import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import Breadcrumb from '@/components/Breadcrumb'

vi.mock('@/i18n/routing', () => ({
  Link: ({
    href,
    children,
    ...props
  }: {
    href: string
    children: React.ReactNode
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

describe('Breadcrumb', () => {
  it('renders home link and items', () => {
    render(
      <Breadcrumb
        items={[
          { label: 'Kravkatalog', href: '/kravkatalog' },
          { label: 'TST-001' },
        ]}
      />,
    )
    expect(screen.getByText('Hem')).toBeInTheDocument()
    expect(screen.getByText('Kravkatalog')).toBeInTheDocument()
    expect(screen.getByText('TST-001')).toBeInTheDocument()
  })

  it('renders last item as current page', () => {
    render(
      <Breadcrumb items={[{ label: 'Kravkatalog' }, { label: 'Detail' }]} />,
    )
    const current = screen.getByText('Detail')
    expect(current).toHaveAttribute('aria-current', 'page')
  })

  it('renders middle items with links', () => {
    render(
      <Breadcrumb
        items={[
          { label: 'Kravkatalog', href: '/kravkatalog' },
          { label: 'Detail' },
        ]}
      />,
    )
    const link = screen.getByRole('link', { name: 'Kravkatalog' })
    expect(link).toHaveAttribute('href', '/kravkatalog')
  })
})
