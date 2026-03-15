import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import VersionHistory from '@/components/VersionHistory'

let locale = 'sv'

vi.mock('next-intl', () => ({
  useLocale: () => locale,
  useTranslations: () => (key: string) => {
    const translations: Record<string, string> = {
      hideNewerVersions: 'Hide newer versions',
      showNewerVersions: 'Show newer versions',
      hideOlderVersions: 'Hide older versions',
      showOlderVersions: 'Show older versions',
    }
    return translations[key] ?? key
  },
}))

function makeVersion(
  versionNumber: number,
  overrides: Partial<{
    archivedAt: string | null
    editedAt: string | null
    publishedAt: string | null
    status: number
    statusColor: string | null
    statusNameEn: string | null
    statusNameSv: string | null
  }> = {},
) {
  return {
    archivedAt: null,
    createdAt: `2026-03-${String(versionNumber).padStart(2, '0')}`,
    description: `Description ${versionNumber}`,
    editedAt: null,
    id: versionNumber,
    publishedAt: null,
    status: 3,
    statusColor: '#22c55e',
    statusNameEn: 'Published',
    statusNameSv: 'Publicerad',
    versionNumber,
    ...overrides,
  }
}

describe('VersionHistory', () => {
  afterEach(() => {
    locale = 'sv'
  })

  it('renders all versions when collapse is not needed and emits selections', async () => {
    locale = 'en'

    const onVersionSelect = vi.fn()
    const { container } = render(
      <VersionHistory
        onVersionSelect={onVersionSelect}
        selectedVersionNumber={3}
        versions={[
          makeVersion(3, {
            editedAt: '2026-03-03',
            status: 1,
            statusColor: '#3b82f6',
            statusNameEn: 'Draft',
            statusNameSv: 'Utkast',
          }),
          makeVersion(2, { publishedAt: '2026-03-02' }),
          makeVersion(1, {
            archivedAt: '2026-03-01',
            status: 4,
            statusColor: '#6b7280',
            statusNameEn: 'Archived',
            statusNameSv: 'Arkiverad',
          }),
        ]}
      />,
    )

    expect(
      container.querySelector('[data-version-number="3"]'),
    ).toBeInTheDocument()
    expect(
      container.querySelector('[data-version-number="2"]'),
    ).toBeInTheDocument()
    expect(
      container.querySelector('[data-version-number="1"]'),
    ).toBeInTheDocument()
    expect(screen.getByText('Draft')).toBeInTheDocument()
    expect(screen.getByText('2026-03-03')).toBeInTheDocument()
    expect(screen.getByText('2026-03-02')).toBeInTheDocument()
    expect(screen.getByText('2026-03-01')).toBeInTheDocument()

    await userEvent.click(
      container.querySelector('[data-version-number="2"]') as HTMLButtonElement,
    )
    expect(onVersionSelect).toHaveBeenCalledWith(2)
  })

  it('collapses trailing archived versions and expands older versions on demand', async () => {
    const onVersionSelect = vi.fn()
    const versions = [
      makeVersion(10),
      makeVersion(9),
      makeVersion(8),
      makeVersion(7),
      makeVersion(6),
      makeVersion(5),
      makeVersion(4, {
        archivedAt: '2026-03-04',
        status: 4,
        statusColor: '#6b7280',
        statusNameEn: 'Archived',
        statusNameSv: 'Arkiverad',
      }),
      makeVersion(3, {
        archivedAt: '2026-03-03',
        status: 4,
        statusColor: '#6b7280',
        statusNameEn: 'Archived',
        statusNameSv: 'Arkiverad',
      }),
      makeVersion(2, {
        archivedAt: '2026-03-02',
        status: 4,
        statusColor: '#6b7280',
        statusNameEn: 'Archived',
        statusNameSv: 'Arkiverad',
      }),
      makeVersion(1, {
        archivedAt: '2026-03-01',
        status: 4,
        statusColor: '#6b7280',
        statusNameEn: 'Archived',
        statusNameSv: 'Arkiverad',
      }),
    ]

    const { container } = render(
      <VersionHistory
        onVersionSelect={onVersionSelect}
        selectedVersionNumber={10}
        versions={versions}
      />,
    )

    expect(container.querySelector('[data-version-number="3"]')).toBeNull()
    expect(screen.getByTitle('Show older versions')).toBeInTheDocument()

    await userEvent.click(screen.getByTitle('Show older versions'))

    expect(
      container.querySelector('[data-version-number="3"]'),
    ).toBeInTheDocument()
    expect(
      container.querySelector('[data-version-number="2"]'),
    ).toBeInTheDocument()
    expect(
      container.querySelector('[data-version-number="1"]'),
    ).toBeInTheDocument()

    await userEvent.click(screen.getByTitle('Hide older versions'))

    expect(container.querySelector('[data-version-number="3"]')).toBeNull()
  })

  it('uses windowed mode around selected archived versions and resets expanded toggles when selection changes', async () => {
    const onVersionSelect = vi.fn()
    const versions = [
      makeVersion(12),
      makeVersion(11),
      makeVersion(10),
      makeVersion(9),
      makeVersion(8),
      makeVersion(7),
      makeVersion(6),
      makeVersion(5, {
        archivedAt: '2026-03-05',
        status: 4,
        statusColor: '#6b7280',
        statusNameEn: 'Archived',
        statusNameSv: 'Arkiverad',
      }),
      makeVersion(4, {
        archivedAt: '2026-03-04',
        status: 4,
        statusColor: '#6b7280',
        statusNameEn: 'Archived',
        statusNameSv: 'Arkiverad',
      }),
      makeVersion(3, {
        archivedAt: '2026-03-03',
        status: 4,
        statusColor: '#6b7280',
        statusNameEn: 'Archived',
        statusNameSv: 'Arkiverad',
      }),
      makeVersion(2, {
        archivedAt: '2026-03-02',
        status: 4,
        statusColor: '#6b7280',
        statusNameEn: 'Archived',
        statusNameSv: 'Arkiverad',
      }),
      makeVersion(1, {
        archivedAt: '2026-03-01',
        status: 4,
        statusColor: '#6b7280',
        statusNameEn: 'Archived',
        statusNameSv: 'Arkiverad',
      }),
    ]

    const { container, rerender } = render(
      <VersionHistory
        onVersionSelect={onVersionSelect}
        selectedVersionNumber={3}
        versions={versions}
      />,
    )

    expect(screen.getByTitle('Show newer versions')).toBeInTheDocument()
    expect(screen.getByTitle('Show older versions')).toBeInTheDocument()
    expect(container.querySelector('[data-version-number="12"]')).toBeNull()
    expect(container.querySelector('[data-version-number="1"]')).toBeNull()
    expect(
      container.querySelector('[data-version-number="4"]'),
    ).toBeInTheDocument()
    expect(
      container.querySelector('[data-version-number="3"]'),
    ).toBeInTheDocument()
    expect(
      container.querySelector('[data-version-number="2"]'),
    ).toBeInTheDocument()

    await userEvent.click(screen.getByTitle('Show newer versions'))
    await userEvent.click(screen.getByTitle('Show older versions'))

    expect(
      container.querySelector('[data-version-number="12"]'),
    ).toBeInTheDocument()
    expect(
      container.querySelector('[data-version-number="1"]'),
    ).toBeInTheDocument()

    rerender(
      <VersionHistory
        onVersionSelect={onVersionSelect}
        selectedVersionNumber={12}
        versions={versions}
      />,
    )

    expect(screen.queryByTitle('Hide newer versions')).toBeNull()
    expect(container.querySelector('[data-version-number="1"]')).toBeNull()
  })

  it('exposes developer-mode metadata for version history pills and toggles', () => {
    const versions = [
      makeVersion(10),
      makeVersion(9),
      makeVersion(8),
      makeVersion(7),
      makeVersion(6),
      makeVersion(5),
      makeVersion(4, {
        archivedAt: '2026-03-04',
        status: 4,
        statusColor: '#6b7280',
        statusNameEn: 'Archived',
        statusNameSv: 'Arkiverad',
      }),
      makeVersion(3, {
        archivedAt: '2026-03-03',
        status: 4,
        statusColor: '#6b7280',
        statusNameEn: 'Archived',
        statusNameSv: 'Arkiverad',
      }),
      makeVersion(2, {
        archivedAt: '2026-03-02',
        status: 4,
        statusColor: '#6b7280',
        statusNameEn: 'Archived',
        statusNameSv: 'Arkiverad',
      }),
      makeVersion(1, {
        archivedAt: '2026-03-01',
        status: 4,
        statusColor: '#6b7280',
        statusNameEn: 'Archived',
        statusNameSv: 'Arkiverad',
      }),
    ]

    const { container } = render(
      <VersionHistory
        developerModeContext="requirements table > inline detail pane: REQ-123"
        onVersionSelect={vi.fn()}
        selectedVersionNumber={10}
        versions={versions}
      />,
    )

    expect(
      container.querySelector('[data-developer-mode-name="version history"]'),
    ).toHaveAttribute(
      'data-developer-mode-context',
      'requirements table > inline detail pane: REQ-123',
    )
    expect(
      container.querySelector(
        '[data-developer-mode-name="version pill"][data-developer-mode-value="v10"]',
      ),
    ).toBeInTheDocument()
    expect(
      container.querySelector(
        '[data-developer-mode-name="version history toggle"][data-developer-mode-value="show older versions"]',
      ),
    ).toBeInTheDocument()
  })
})
