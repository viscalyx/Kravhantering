import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { okResponse } from './test-helpers'

const localeState = vi.hoisted(() => ({ locale: 'en' }))

vi.mock('next-intl', () => ({
  useLocale: () => localeState.locale,
  useTranslations: (ns?: string) => (key: string) =>
    ns ? `${ns}.${key}` : key,
}))

vi.mock('@/i18n/routing', () => ({
  Link: ({ children, href, ...props }: Record<string, unknown>) => (
    <a href={href as string} {...props}>
      {children as React.ReactNode}
    </a>
  ),
}))

vi.mock('@/components/ConfirmModal', () => ({
  useConfirmModal: () => ({ confirm: vi.fn() }),
}))

vi.mock('@/components/StatusBadge', () => ({
  default: ({
    color,
    iconName,
    label,
    theme = 'auto',
  }: {
    color: string | null
    iconName?: string | null
    label: string
    theme?: string
  }) => (
    <span
      data-badge-color={color}
      data-badge-icon={iconName}
      data-badge-theme={theme}
    >
      {label}
    </span>
  ),
}))

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

import PriorityLevelsClient from '@/app/[locale]/priority-levels/priority-levels-client'

const samplePriorityLevels = [
  {
    assessmentCriteriaEn: 'Low assessment',
    assessmentCriteriaSv: 'Låg bedömning',
    code: 'P2',
    id: 1,
    nameSv: 'Låg',
    nameEn: 'Low',
    descriptionEn: 'Low priority',
    descriptionSv: 'Låg prioritet',
    color: '#22c55e',
    iconName: 'ArrowDownLeft',
    sortOrder: 1,
    linkedRequirementCount: 5,
  },
  {
    assessmentCriteriaEn: 'Medium assessment',
    assessmentCriteriaSv: 'Medel bedömning',
    code: 'P3',
    id: 2,
    nameSv: 'Medel',
    nameEn: 'Medium',
    descriptionEn: 'Medium priority',
    descriptionSv: 'Medel prioritet',
    color: '#eab308',
    iconName: 'AlertCircle',
    sortOrder: 2,
    linkedRequirementCount: 3,
  },
]

describe('PriorityLevelsClient', () => {
  afterEach(cleanup)

  beforeEach(() => {
    localeState.locale = 'en'
    vi.clearAllMocks()
    fetchMock.mockResolvedValue(
      okResponse({ priorityLevels: samplePriorityLevels }),
    )
  })

  it('renders priority levels without create or delete actions', async () => {
    render(<PriorityLevelsClient />)

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'nav.priorityLevels',
    )
    await waitFor(() => {
      expect(screen.getByText('P2 – Low')).toBeInTheDocument()
    })
    expect(screen.getByText('P3 – Medium')).toBeInTheDocument()
    expect(
      screen.getByRole('columnheader', {
        name: 'priorityLevelAdmin.priority',
      }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('columnheader', { name: 'priorityLevelAdmin.color' }),
    ).toBeNull()
    expect(
      screen.queryByRole('columnheader', { name: 'priorityLevelAdmin.code' }),
    ).toBeNull()
    expect(screen.queryByRole('button', { name: /common\.create/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /common\.delete/i })).toBeNull()
    expect(
      screen.getAllByRole('button', { name: /common\.edit/i }),
    ).toHaveLength(2)
  })

  it('renders the priority designation in the active language', async () => {
    localeState.locale = 'sv'

    render(<PriorityLevelsClient />)

    await waitFor(() => {
      expect(screen.getByText('P2 – Låg')).toBeInTheDocument()
    })
    expect(
      screen.getByRole('columnheader', {
        name: 'priorityLevelAdmin.priority',
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('columnheader', {
        name: 'priorityLevelAdmin.description',
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('columnheader', {
        name: 'priorityLevelAdmin.assessmentCriteria',
      }),
    ).toBeInTheDocument()
    expect(screen.getByText('Låg prioritet')).toBeInTheDocument()
    expect(screen.getByText('Låg bedömning')).toBeInTheDocument()
    expect(screen.queryByText('Low')).toBeNull()
    expect(screen.queryByText('Low priority')).toBeNull()
    expect(screen.queryByText('Low assessment')).toBeNull()
  })

  it('shows loading text initially', () => {
    fetchMock.mockReturnValue(new Promise(() => {}))

    render(<PriorityLevelsClient />)

    expect(screen.getByText('common.loading')).toBeInTheDocument()
  })

  it('renders a message-only empty state without create CTA', async () => {
    fetchMock.mockResolvedValue(okResponse({ priorityLevels: [] }))

    render(<PriorityLevelsClient />)

    const emptyState = await screen.findByText('priorityLevelAdmin.emptyState')
    expect(emptyState.closest('td')).toHaveAttribute('colspan', '6')
    expect(screen.queryByRole('button', { name: /common\.create/i })).toBeNull()
  })

  it('opens edit form with existing data', async () => {
    render(<PriorityLevelsClient />)
    await waitFor(() => {
      expect(screen.getByText('P2 – Low')).toBeInTheDocument()
    })

    fireEvent.click(screen.getAllByRole('button', { name: /common\.edit/i })[0])

    expect(
      (
        screen.getByLabelText(
          /priorityLevelAdmin\.name.+EN/,
        ) as HTMLInputElement
      ).value,
    ).toBe('Low')
    expect(document.querySelector('[data-color-swatch="exact-rgb"]')).toBeNull()
    const codeSortRow = document
      .getElementById('priority-code')
      ?.closest('[data-priority-form-row="code-sort"]')
    expect(codeSortRow).toHaveClass('grid', 'sm:grid-cols-2')
    expect(codeSortRow).toContainElement(
      document.getElementById('priority-sort-order'),
    )
    const colorHexInput = screen.getByLabelText('priorityLevelAdmin.colorHex')
    expect(colorHexInput).toHaveValue('#22c55e')
    expect(colorHexInput).toHaveClass('max-w-36')
    expect(screen.getByLabelText('priorityLevelAdmin.colorPicker')).toHaveValue(
      '#22c55e',
    )
    const colorIconRow = document
      .getElementById('priority-color-hex')
      ?.closest('[data-priority-form-row="color-icon"]')
    expect(colorIconRow).toHaveClass('grid', 'sm:grid-cols-2')
    expect(colorIconRow).toContainElement(
      document.getElementById('priority-icon'),
    )
    await waitFor(() => {
      expect(screen.getByText('common.noneAvailable')).toBeInTheDocument()
    })
  })

  it('shows contextual help for sort order, color, and icon fields', async () => {
    const user = userEvent.setup()
    render(<PriorityLevelsClient />)
    await screen.findByText('P2 – Low')

    await user.click(
      screen.getAllByRole('button', { name: /common\.edit/i })[0],
    )

    for (const field of ['sortOrder', 'color', 'icon']) {
      await user.click(
        screen.getByRole('button', {
          name: `common.help: priorityLevelAdmin.${field}`,
        }),
      )
      expect(
        await screen.findByText(`priorityLevelAdmin.${field}Help`),
      ).toBeInTheDocument()
    }
  })

  it('shows shared light and dark badge previews with contrast guidance', async () => {
    render(<PriorityLevelsClient />)
    await screen.findByText('P2 – Low')

    fireEvent.click(screen.getAllByRole('button', { name: /common\.edit/i })[0])
    await screen.findByText('common.noneAvailable')

    const preview = screen.getByRole('status', {
      name: 'priorityLevelAdmin.themePreview',
    })
    expect(preview).toHaveTextContent('priorityLevelAdmin.themePreviewGuidance')
    expect(preview).toHaveTextContent('priorityLevelAdmin.lightTheme')
    expect(preview).toHaveTextContent('priorityLevelAdmin.darkTheme')
    expect(preview).toHaveTextContent('P2 – Low')
    expect(preview.querySelector('[data-badge-theme="light"]')).toHaveAttribute(
      'data-badge-icon',
      'ArrowDownLeft',
    )
    expect(preview.querySelector('[data-badge-theme="dark"]')).toHaveAttribute(
      'data-badge-color',
      '#22c55e',
    )
    expect(
      preview.querySelectorAll(
        ':scope [data-badge-theme="light"], :scope [data-badge-theme="dark"]',
      ),
    ).toHaveLength(2)
    expect(
      document.querySelector(
        '[data-developer-mode-name="theme contrast preview"]',
      ),
    ).toBeTruthy()
  })

  it('warns about invalid stored colors and omits the invalid preview', async () => {
    fetchMock.mockResolvedValue(
      okResponse({
        priorityLevels: [
          { ...samplePriorityLevels[0], color: 'invalid-color' },
        ],
      }),
    )
    render(<PriorityLevelsClient />)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'priorityLevelAdmin.invalidStoredColors',
    )
    fireEvent.click(screen.getByRole('button', { name: /common\.edit/i }))
    await screen.findByText('common.noneAvailable')
    expect(
      screen.getByRole('status', {
        name: 'priorityLevelAdmin.themePreview',
      }),
    ).toHaveTextContent('priorityLevelAdmin.invalidColorWarning')
    const colorHexInput = screen.getByLabelText('priorityLevelAdmin.colorHex')
    expect(colorHexInput).toHaveValue('invalid-color')
    expect(colorHexInput).toHaveAttribute('aria-invalid', 'true')
    expect(document.querySelector('[data-color-swatch="exact-rgb"]')).toBeNull()
    expect(screen.queryByLabelText('priorityLevelAdmin.colorPicker')).toBeNull()
    expect(document.body.innerHTML).not.toContain('#000000')
    expect(document.querySelector('[style*="invalid-color"]')).toBeNull()
  })

  it('submits edits through PUT', async () => {
    render(<PriorityLevelsClient />)
    await waitFor(() => {
      expect(screen.getByText('P2 – Low')).toBeInTheDocument()
    })

    fireEvent.click(screen.getAllByRole('button', { name: /common\.edit/i })[0])
    fireEvent.change(screen.getByLabelText(/priorityLevelAdmin\.name.+EN/), {
      target: { value: 'Very low' },
    })

    fetchMock.mockResolvedValueOnce(okResponse({ id: 1 }))
    fetchMock.mockResolvedValueOnce(
      okResponse({ priorityLevels: samplePriorityLevels }),
    )

    fireEvent.click(screen.getByRole('button', { name: /common\.save/i }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/priority-levels/1',
        expect.objectContaining({ method: 'PUT' }),
      )
    })
  })

  it('submits a blank sort order as invalid instead of coercing to zero', async () => {
    render(<PriorityLevelsClient />)
    await waitFor(() => {
      expect(screen.getByText('P2 – Low')).toBeInTheDocument()
    })

    fireEvent.click(screen.getAllByRole('button', { name: /common\.edit/i })[0])
    fireEvent.change(screen.getByLabelText('priorityLevelAdmin.sortOrder'), {
      target: { value: '' },
    })

    fetchMock.mockResolvedValueOnce(okResponse({ id: 1 }))
    fetchMock.mockResolvedValueOnce(
      okResponse({ priorityLevels: samplePriorityLevels }),
    )

    fireEvent.click(screen.getByRole('button', { name: /common\.save/i }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/priority-levels/1',
        expect.objectContaining({ method: 'PUT' }),
      )
    })
    const putCall = fetchMock.mock.calls.find(
      ([url, init]) =>
        url === '/api/priority-levels/1' &&
        (init as RequestInit | undefined)?.method === 'PUT',
    )
    const body = JSON.parse(
      String((putCall?.[1] as RequestInit | undefined)?.body),
    ) as {
      sortOrder: number | null
    }
    expect(body.sortOrder).toBeNull()
  })

  it('clears linked requirements when a later linked fetch fails', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/priority-levels') {
        return okResponse({ priorityLevels: samplePriorityLevels })
      }
      if (url === '/api/priority-levels/1') {
        return okResponse({
          linkedRequirements: [
            {
              description: 'Requirement one',
              id: 10,
              statusColor: '#3b82f6',
              statusNameEn: 'Draft',
              statusNameSv: 'Utkast',
              uniqueId: 'REQ-1',
              versionNumber: 1,
            },
          ],
        })
      }
      if (url === '/api/priority-levels/2') {
        return new Response(JSON.stringify({ error: 'Bad request' }), {
          headers: { 'content-type': 'application/json' },
          status: 400,
          statusText: 'Bad Request',
        })
      }
      return okResponse({})
    })

    render(<PriorityLevelsClient />)
    await waitFor(() => {
      expect(screen.getByText('P2 – Low')).toBeInTheDocument()
    })

    const editButtons = screen.getAllByRole('button', {
      name: /common\.edit/i,
    })
    fireEvent.click(editButtons[0])

    await waitFor(() => {
      expect(screen.getByText('REQ-1')).toBeInTheDocument()
    })

    fireEvent.click(editButtons[1])

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/priority-levels/2')
    })
    await waitFor(() => {
      expect(screen.queryByText('common.loading')).toBeNull()
    })
    expect(screen.queryByText('REQ-1')).toBeNull()
    expect(screen.getByText('common.noneAvailable')).toBeInTheDocument()
  })

  it('closes edit form on cancel', async () => {
    const user = userEvent.setup()
    render(<PriorityLevelsClient />)
    await waitFor(() => {
      expect(screen.getByText('P2 – Low')).toBeInTheDocument()
    })

    fireEvent.click(screen.getAllByRole('button', { name: /common\.edit/i })[0])
    await waitFor(() => {
      expect(screen.getByText('common.noneAvailable')).toBeInTheDocument()
    })
    await user.click(screen.getByRole('button', { name: /common\.cancel/i }))

    await waitFor(() => {
      expect(screen.queryByLabelText(/priorityLevelAdmin\.name.+SV/)).toBeNull()
    })
  })
})
