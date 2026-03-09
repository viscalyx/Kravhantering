import { act, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import RequirementsTable from '@/components/RequirementsTable'

const mockPush = vi.fn()

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const t: Record<string, string> = {
      uniqueId: 'Krav-ID',
      description: 'Beskrivning',
      area: 'Kravområde',
      category: 'Kravkategori',
      type: 'Kravtyp',
      status: 'Kravstatus',
      requiresTesting: 'Kräver testning',
      hasPendingVersion: 'Det finns en väntande version',
      noResults: 'Inga resultat hittades',
      loadingRequirements: 'Hämtar krav\u2026',
      version: 'Version',
    }
    return t[key] ?? key
  },
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
    expect(screen.getByText('Inga resultat hittades')).toBeTruthy()
  })

  it('renders loading state when loading is true', () => {
    vi.useFakeTimers()
    render(<RequirementsTable loading locale="sv" rows={[]} />)
    expect(screen.queryByText('Hämtar krav\u2026')).toBeNull()
    act(() => vi.advanceTimersByTime(1000))
    expect(screen.getByText('Hämtar krav\u2026')).toBeTruthy()
    expect(screen.queryByText('Inga resultat hittades')).toBeTruthy()
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
    expect(screen.getByLabelText('Det finns en väntande version')).toBeTruthy()
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

    expect(tr?.classList.contains('opacity-50')).toBe(true)
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
