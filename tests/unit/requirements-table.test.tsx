import { act, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import RequirementsTable from '@/components/RequirementsTable'

const mockPush = vi.fn()

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('@/i18n/routing', () => ({
  Link: ({ children, href, ...props }: Record<string, unknown>) => (
    <a href={href as string} {...props}>
      {children as React.ReactNode}
    </a>
  ),
  usePathname: () => '/kravkatalog',
  useRouter: () => ({ push: mockPush }),
}))

describe('RequirementsTable', () => {
  it('renders empty state when no rows', () => {
    render(<RequirementsTable locale="sv" rows={[]} />)
    expect(screen.getByText('noResults')).toBeTruthy()
  })

  it('renders loading state when loading is true', () => {
    vi.useFakeTimers()
    render(<RequirementsTable loading locale="sv" rows={[]} />)
    expect(screen.queryByText('loadingRequirements')).toBeNull()
    act(() => vi.advanceTimersByTime(1000))
    expect(screen.getByText('loadingRequirements')).toBeTruthy()
    expect(screen.queryByText('noResults')).toBeTruthy()
    vi.useRealTimers()
  })

  it('renders table rows with status badge', () => {
    const rows = [
      {
        id: 1,
        uniqueId: 'INT0001',
        isArchived: false,
        version: {
          description: 'Testkrav',
          categoryNameSv: 'Verksamhetskrav',
          categoryNameEn: 'Business requirement',
          typeNameSv: 'Funktionellt',
          typeNameEn: 'Functional',
          typeCategoryNameSv: null,
          typeCategoryNameEn: null,
          requiresTesting: true,
          versionNumber: 2,
          status: 3,
          statusNameSv: 'Publicerad',
          statusNameEn: 'Published',
          statusColor: '#22c55e',
        },
        area: { name: 'Integration' },
      },
    ]
    render(<RequirementsTable locale="sv" rows={rows} />)

    expect(screen.getByText('INT0001')).toBeTruthy()
    expect(screen.getByText('Testkrav')).toBeTruthy()
    expect(screen.getByText('Integration')).toBeTruthy()
    expect(screen.getByText('Publicerad')).toBeTruthy()
    expect(screen.getByText('v2')).toBeTruthy()
  })

  it('shows pending version indicator', () => {
    const rows = [
      {
        id: 1,
        uniqueId: 'INT0001',
        isArchived: false,
        hasPendingVersion: true,
        pendingVersionStatusColor: '#3b82f6',
        pendingVersionStatusId: 2,
        version: {
          description: 'Test',
          categoryNameSv: null,
          categoryNameEn: null,
          typeNameSv: null,
          typeNameEn: null,
          typeCategoryNameSv: null,
          typeCategoryNameEn: null,
          requiresTesting: false,
          versionNumber: 1,
          status: 3,
          statusNameSv: 'Publicerad',
          statusNameEn: 'Published',
          statusColor: '#22c55e',
        },
        area: null,
      },
    ]
    render(<RequirementsTable locale="sv" rows={rows} />)
    expect(screen.getByLabelText('hasPendingVersionReview')).toBeTruthy()
  })

  it('shows a blue pending draft indicator for archived rows', () => {
    const rows = [
      {
        id: 1,
        uniqueId: 'INT0003',
        isArchived: true,
        hasPendingVersion: true,
        pendingVersionStatusColor: '#3b82f6',
        pendingVersionStatusId: 1,
        version: {
          description: 'Arkiverad',
          categoryNameSv: null,
          categoryNameEn: null,
          typeNameSv: null,
          typeNameEn: null,
          typeCategoryNameSv: null,
          typeCategoryNameEn: null,
          requiresTesting: false,
          versionNumber: 1,
          status: 4,
          statusNameSv: 'Arkiverad',
          statusNameEn: 'Archived',
          statusColor: '#6b7280',
        },
        area: null,
      },
    ]

    render(<RequirementsTable locale="sv" rows={rows} />)

    expect(screen.getAllByText('Arkiverad')).toHaveLength(2)
    expect(
      screen.getByLabelText('hasPendingVersionDraft').closest('tr')?.className,
    ).not.toContain('opacity-50')
    expect(screen.getByLabelText('hasPendingVersionDraft')).toHaveStyle({
      color: '#3b82f6',
    })
  })

  it('shows a yellow pending review indicator for archived rows', () => {
    const rows = [
      {
        id: 1,
        uniqueId: 'INT0004',
        isArchived: true,
        hasPendingVersion: true,
        pendingVersionStatusColor: '#eab308',
        pendingVersionStatusId: 2,
        version: {
          description: 'Arkiverad',
          categoryNameSv: null,
          categoryNameEn: null,
          typeNameSv: null,
          typeNameEn: null,
          typeCategoryNameSv: null,
          typeCategoryNameEn: null,
          requiresTesting: false,
          versionNumber: 1,
          status: 4,
          statusNameSv: 'Arkiverad',
          statusNameEn: 'Archived',
          statusColor: '#6b7280',
        },
        area: null,
      },
    ]

    render(<RequirementsTable locale="sv" rows={rows} />)

    expect(screen.getAllByText('Arkiverad')).toHaveLength(2)
    expect(
      screen.getByLabelText('hasPendingVersionReview').closest('tr')?.className,
    ).not.toContain('opacity-50')
    expect(screen.getByLabelText('hasPendingVersionReview')).toHaveStyle({
      color: '#eab308',
    })
  })

  it('applies opacity for archived rows', () => {
    const rows = [
      {
        id: 1,
        uniqueId: 'INT0002',
        isArchived: true,
        version: {
          description: 'Arkiverad',
          categoryNameSv: null,
          categoryNameEn: null,
          typeNameSv: null,
          typeNameEn: null,
          typeCategoryNameSv: null,
          typeCategoryNameEn: null,
          requiresTesting: false,
          versionNumber: 1,
          status: 4,
          statusNameSv: 'Arkiverad',
          statusNameEn: 'Archived',
          statusColor: '#6b7280',
        },
        area: null,
      },
    ]
    const { container } = render(<RequirementsTable locale="sv" rows={rows} />)
    const tr = container.querySelector('tbody tr')
    const firstCell = tr?.querySelector('td')

    expect(tr?.classList.contains('opacity-50')).toBe(false)
    expect(firstCell?.className).toContain('opacity-50')
  })

  it('applies zebra striping on alternating rows', () => {
    const rows = [
      {
        id: 1,
        uniqueId: 'INT0001',
        isArchived: false,
        version: {
          description: 'A',
          categoryNameSv: null,
          categoryNameEn: null,
          typeNameSv: null,
          typeNameEn: null,
          typeCategoryNameSv: null,
          typeCategoryNameEn: null,
          requiresTesting: false,
          versionNumber: 1,
          status: 1,
          statusNameSv: 'Utkast',
          statusNameEn: 'Draft',
          statusColor: '#3b82f6',
        },
        area: null,
      },
      {
        id: 2,
        uniqueId: 'INT0002',
        isArchived: false,
        version: {
          description: 'B',
          categoryNameSv: null,
          categoryNameEn: null,
          typeNameSv: null,
          typeNameEn: null,
          typeCategoryNameSv: null,
          typeCategoryNameEn: null,
          requiresTesting: false,
          versionNumber: 1,
          status: 1,
          statusNameSv: 'Utkast',
          statusNameEn: 'Draft',
          statusColor: '#3b82f6',
        },
        area: null,
      },
    ]
    const { container } = render(<RequirementsTable locale="sv" rows={rows} />)
    const trs = container.querySelectorAll('tbody tr')

    expect(trs[0]?.className).not.toContain('bg-secondary-50/40')
    expect(trs[1]?.className).toContain('bg-secondary-50/40')
  })
})
