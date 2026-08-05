import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { okResponse } from './test-helpers'

const confirmMock = vi.fn()
const intlState = vi.hoisted(() => ({ locale: 'en' }))

vi.mock('next-intl', () => ({
  useLocale: () => intlState.locale,
  useTranslations: (ns?: string) => (key: string) =>
    ns ? `${ns}.${key}` : key,
}))

vi.mock('@/components/ConfirmModal', () => ({
  useConfirmModal: () => ({ confirm: confirmMock }),
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

vi.mock('@/components/IconPicker', () => ({
  default: ({
    disabled,
    label,
    onChange,
  }: {
    disabled?: boolean
    label: string
    onChange: (value: string | null) => void
  }) => (
    <button
      disabled={disabled}
      onClick={() => onChange('Shield')}
      type="button"
    >
      {label}
    </button>
  ),
}))

function notOk() {
  return new Response(JSON.stringify({ error: 'Bad request' }), {
    headers: { 'content-type': 'application/json' },
    status: 400,
    statusText: 'Bad Request',
  })
}

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

import SpecificationItemStatusesClient from '@/app/[locale]/specification-item-statuses/specification-item-statuses-client'

const sampleStatuses = [
  {
    id: 5,
    nameSv: 'Avviken',
    nameEn: 'Deviated',
    descriptionSv: 'Avsteg har registrerats för kravet',
    descriptionEn: 'A deviation has been registered for the requirement',
    color: '#ef4444',
    iconName: 'AlertTriangle',
    sortOrder: 0,
    linkedItemCount: 1,
  },
  {
    id: 1,
    nameSv: 'Inkluderad',
    nameEn: 'Included',
    descriptionSv: 'Kravet finns i underlaget',
    descriptionEn: 'Requirement is in the specification',
    color: '#94a3b8',
    iconName: 'Circle',
    sortOrder: 1,
    linkedItemCount: 5,
  },
  {
    id: 2,
    nameSv: 'Pågående',
    nameEn: 'In Progress',
    descriptionSv: null,
    descriptionEn: null,
    color: '#f59e0b',
    iconName: 'Clock',
    sortOrder: 2,
    linkedItemCount: 3,
  },
]

const statusNameSvInput = () =>
  screen.getByRole('textbox', {
    name: /specificationItemStatusAdmin\.name.+SV/,
  })
const statusNameEnInput = () =>
  screen.getByRole('textbox', {
    name: /specificationItemStatusAdmin\.name.+EN/,
  })
const statusSortOrderInput = () =>
  screen.getByRole('spinbutton', {
    name: /specificationItemStatusAdmin\.sortOrder/,
  })

describe('SpecificationItemStatusesClient', () => {
  afterEach(cleanup)

  beforeEach(() => {
    vi.clearAllMocks()
    intlState.locale = 'en'
    fetchMock.mockImplementation(() =>
      Promise.resolve(okResponse({ statuses: sampleStatuses })),
    )
  })

  it('renders heading without create button', async () => {
    render(<SpecificationItemStatusesClient />)
    expect(
      screen.getByRole('heading', {
        name: /specificationItemStatusAdmin\.title/,
      }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /common\.create/i })).toBeNull()
    await waitFor(() => {
      expect(screen.getAllByText('Included').length).toBeGreaterThanOrEqual(1)
    })
  })

  it('fetches and displays usage statuses', async () => {
    render(<SpecificationItemStatusesClient />)
    await waitFor(() => {
      expect(screen.getAllByText('Included').length).toBeGreaterThanOrEqual(1)
    })
    expect(screen.getAllByText('In Progress').length).toBeGreaterThanOrEqual(1)
  })

  it('renders Swedish status names and descriptions for the Swedish locale', async () => {
    intlState.locale = 'sv'

    render(<SpecificationItemStatusesClient />)

    expect(await screen.findAllByText('Inkluderad')).not.toHaveLength(0)
    expect(screen.getByText('Kravet finns i underlaget')).toBeInTheDocument()
  })

  it('shows definition column with description text', async () => {
    render(<SpecificationItemStatusesClient />)
    await waitFor(() => {
      expect(screen.getAllByText('Included').length).toBeGreaterThanOrEqual(1)
    })
    expect(
      screen.getByText('specificationItemStatusAdmin.definition'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Requirement is in the specification'),
    ).toBeInTheDocument()
  })

  it('shows loading text initially', () => {
    fetchMock.mockReturnValue(new Promise(() => {}))
    render(<SpecificationItemStatusesClient />)
    expect(screen.getByText('common.loading')).toBeInTheDocument()
  })

  it('shows the catalog load error with the empty catalog', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    fetchMock.mockRejectedValue(new Error('catalog unavailable'))

    render(<SpecificationItemStatusesClient />)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'catalog unavailable',
    )
    expect(
      screen.getByText('specificationItemStatusAdmin.emptyState'),
    ).toBeInTheDocument()
  })

  it('renders a message-only empty state without create CTA', async () => {
    fetchMock.mockResolvedValue(okResponse({ statuses: [] }))

    render(<SpecificationItemStatusesClient />)

    const emptyState = await screen.findByText(
      'specificationItemStatusAdmin.emptyState',
    )
    expect(emptyState.closest('td')).toHaveAttribute('colspan', '6')
    expect(screen.queryByRole('button', { name: /common\.create/i })).toBeNull()
  })

  it('does not render a create form entry point', async () => {
    render(<SpecificationItemStatusesClient />)
    await waitFor(() => {
      expect(screen.getAllByText('Included').length).toBeGreaterThanOrEqual(1)
    })
    expect(screen.queryByRole('button', { name: /common\.create/i })).toBeNull()
    expect(
      screen.queryByRole('textbox', {
        name: /specificationItemStatusAdmin\.name.+SV/,
      }),
    ).toBeNull()
  })

  it('shows collapsible inline help for usage status fields', async () => {
    render(<SpecificationItemStatusesClient />)
    await waitFor(() => {
      expect(screen.getAllByText('Included').length).toBeGreaterThanOrEqual(1)
    })
    const editButtons = screen.getAllByRole('button', {
      name: /common\.edit/i,
    })
    fireEvent.click(editButtons[1])
    await waitFor(() => {
      expect(screen.getByText('common.noneAvailable')).toBeInTheDocument()
    })

    const helpButtons = [
      'common.help: specificationItemStatusAdmin.name (SV)',
      'common.help: specificationItemStatusAdmin.name (EN)',
      'common.help: specificationItemStatusAdmin.definition (SV)',
      'common.help: specificationItemStatusAdmin.definition (EN)',
      'common.help: specificationItemStatusAdmin.color',
      'common.help: specificationItemStatusAdmin.sortOrder',
    ] as const

    for (const label of helpButtons) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
    }

    const definitionHelpButton = screen.getByRole('button', {
      name: 'common.help: specificationItemStatusAdmin.definition (SV)',
    })
    fireEvent.click(definitionHelpButton)

    expect(definitionHelpButton).toHaveAttribute('aria-expanded', 'true')
    expect(
      screen.getByText('specificationItemStatusAdmin.definitionSvHelp'),
    ).toBeInTheDocument()
  })

  it('submits edit form', async () => {
    render(<SpecificationItemStatusesClient />)
    await waitFor(() => {
      expect(screen.getAllByText('Included').length).toBeGreaterThanOrEqual(1)
    })
    const editButtons = screen.getAllByRole('button', {
      name: /common\.edit/i,
    })
    fireEvent.click(editButtons[1])
    fireEvent.change(statusNameSvInput(), { target: { value: 'Ny status' } })
    fireEvent.change(statusNameEnInput(), { target: { value: 'New status' } })

    fetchMock.mockResolvedValueOnce(okResponse({ id: 1 }))
    fetchMock.mockResolvedValueOnce(okResponse({ statuses: sampleStatuses }))

    fireEvent.click(screen.getByRole('button', { name: /common\.save/i }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/catalog/specification-item-statuses/1',
        expect.objectContaining({ method: 'PUT' }),
      )
    })
  })

  it('opens edit form with existing data', async () => {
    render(<SpecificationItemStatusesClient />)
    await waitFor(() => {
      expect(screen.getAllByText('Included').length).toBeGreaterThanOrEqual(1)
    })
    const editButtons = screen.getAllByRole('button', {
      name: /common\.edit/i,
    })
    fireEvent.click(editButtons[1])
    expect((statusNameEnInput() as HTMLInputElement).value).toBe('Included')
    await waitFor(() => {
      expect(screen.getByText('common.noneAvailable')).toBeInTheDocument()
    })
  })

  it('shows shared light and dark badge previews with exact color metadata', async () => {
    render(<SpecificationItemStatusesClient />)
    await screen.findAllByText('Included')
    fireEvent.click(screen.getAllByRole('button', { name: /common\.edit/i })[1])
    await screen.findByText('common.noneAvailable')

    const preview = screen.getByRole('status', {
      name: 'specificationItemStatusAdmin.themePreview',
    })
    expect(preview).toHaveTextContent('specificationItemStatusAdmin.lightTheme')
    expect(preview).toHaveTextContent('specificationItemStatusAdmin.darkTheme')
    expect(preview).toHaveTextContent(
      'specificationItemStatusAdmin.contrastPass',
    )
    expect(preview.querySelector('[data-badge-theme="light"]')).toHaveAttribute(
      'data-badge-color',
      '#94a3b8',
    )
    expect(
      document.querySelector('[data-color-swatch="exact-rgb"]'),
    ).toHaveStyle({ backgroundColor: '#94a3b8' })
    expect(
      screen.getByLabelText('specificationItemStatusAdmin.colorHex'),
    ).toBeRequired()
    expect(
      document.querySelector(
        '[data-developer-mode-name="theme contrast preview"]',
      ),
    ).toBeTruthy()
  })

  it('keeps Save disabled until the edited color has an exact hex format', async () => {
    render(<SpecificationItemStatusesClient />)
    await screen.findAllByText('Included')
    fireEvent.click(screen.getAllByRole('button', { name: /common\.edit/i })[1])
    await screen.findByText('common.noneAvailable')

    const colorInput = screen.getByLabelText(
      'specificationItemStatusAdmin.colorHex',
    )
    const saveButton = screen.getByRole('button', { name: /common\.save/i })

    fireEvent.change(colorInput, { target: { value: '#abc' } })
    expect(saveButton).toBeDisabled()

    fireEvent.change(colorInput, { target: { value: '#A1B2C3' } })
    expect(saveButton).toBeEnabled()
  })

  it('surfaces an invalid stored color without fallback accent styling', async () => {
    fetchMock.mockResolvedValue(
      okResponse({
        statuses: [{ ...sampleStatuses[1], color: 'invalid-color' }],
      }),
    )
    render(<SpecificationItemStatusesClient />)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'specificationItemStatusAdmin.invalidStoredColors',
    )
    fireEvent.click(screen.getByRole('button', { name: /common\.edit/i }))
    await screen.findByText('common.noneAvailable')
    expect(
      screen.getByLabelText('specificationItemStatusAdmin.colorHex'),
    ).toHaveValue('invalid-color')
    expect(
      screen.getByRole('status', {
        name: 'specificationItemStatusAdmin.themePreview',
      }),
    ).toHaveTextContent('specificationItemStatusAdmin.invalidColorWarning')
    expect(document.querySelector('[data-color-swatch="exact-rgb"]')).toBeNull()
    expect(document.querySelector('[style*="invalid-color"]')).toBeNull()
  })

  it('shows an error instead of an empty state when linked specifications fail to load', async () => {
    fetchMock
      .mockResolvedValueOnce(okResponse({ statuses: sampleStatuses }))
      .mockResolvedValueOnce(notOk())

    render(<SpecificationItemStatusesClient />)
    await waitFor(() => {
      expect(screen.getAllByText('Included').length).toBeGreaterThanOrEqual(1)
    })

    const editButtons = screen.getAllByRole('button', {
      name: /common\.edit/i,
    })
    fireEvent.click(editButtons[1])

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('common.error')
    })
    expect(screen.queryByText('common.noneAvailable')).toBeNull()
  })

  it('closes form on cancel', async () => {
    render(<SpecificationItemStatusesClient />)
    await waitFor(() => {
      expect(screen.getAllByText('Included').length).toBeGreaterThanOrEqual(1)
    })
    const editButtons = screen.getAllByRole('button', {
      name: /common\.edit/i,
    })
    fireEvent.click(editButtons[1])
    await waitFor(() => {
      expect(screen.getByText('common.noneAvailable')).toBeInTheDocument()
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /common\.cancel/i }))
    })
    expect(
      screen.queryByRole('textbox', {
        name: /specificationItemStatusAdmin\.name.+SV/,
      }),
    ).toBeNull()
  })

  it('does not render delete controls', async () => {
    render(<SpecificationItemStatusesClient />)
    await waitFor(() => {
      expect(screen.getAllByText('Included').length).toBeGreaterThanOrEqual(1)
    })
    expect(screen.queryByRole('button', { name: /common\.delete/i })).toBeNull()
    expect(confirmMock).not.toHaveBeenCalled()
  })

  it('disables sort order field when editing the default status (ID 1)', async () => {
    fetchMock.mockResolvedValueOnce(okResponse({ statuses: sampleStatuses }))
    fetchMock.mockResolvedValueOnce(
      okResponse({ status: sampleStatuses[1], linkedItems: [] }),
    )
    render(<SpecificationItemStatusesClient />)
    await waitFor(() => {
      expect(screen.getAllByText('Included').length).toBeGreaterThanOrEqual(1)
    })
    const editButtons = screen.getAllByRole('button', {
      name: /common\.edit/i,
    })
    fireEvent.click(editButtons[1])
    const sortInput = statusSortOrderInput() as HTMLInputElement
    expect(sortInput.disabled).toBe(true)
    expect(
      screen.getByText('specificationItemStatusAdmin.sortOrderLocked'),
    ).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByText('common.noneAvailable')).toBeInTheDocument()
    })
  })

  it('disables sort order field when editing the deviated status (ID 5)', async () => {
    fetchMock.mockResolvedValueOnce(okResponse({ statuses: sampleStatuses }))
    fetchMock.mockResolvedValueOnce(
      okResponse({ status: sampleStatuses[0], linkedItems: [] }),
    )
    render(<SpecificationItemStatusesClient />)
    await waitFor(() => {
      expect(screen.getAllByText('Deviated').length).toBeGreaterThanOrEqual(1)
    })
    const editButtons = screen.getAllByRole('button', {
      name: /common\.edit/i,
    })
    fireEvent.click(editButtons[0])
    const sortInput = statusSortOrderInput() as HTMLInputElement
    expect(sortInput.disabled).toBe(true)
    expect(
      screen.getByText('specificationItemStatusAdmin.sortOrderLocked'),
    ).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByText('common.noneAvailable')).toBeInTheDocument()
    })
  })

  it('enables sort order field when editing a non-default status', async () => {
    fetchMock.mockResolvedValueOnce(okResponse({ statuses: sampleStatuses }))
    fetchMock.mockResolvedValueOnce(
      okResponse({ status: sampleStatuses[2], linkedItems: [] }),
    )
    render(<SpecificationItemStatusesClient />)
    await waitFor(() => {
      expect(screen.getAllByText('Included').length).toBeGreaterThanOrEqual(1)
    })
    const editButtons = screen.getAllByRole('button', {
      name: /common\.edit/i,
    })
    fireEvent.click(editButtons[2])
    const sortInput = statusSortOrderInput() as HTMLInputElement
    expect(sortInput.disabled).toBe(false)
    expect(
      screen.queryByText('specificationItemStatusAdmin.sortOrderLocked'),
    ).toBeNull()
    await waitFor(() => {
      expect(screen.getByText('common.noneAvailable')).toBeInTheDocument()
    })
  })

  it('edits every optional status field and renders linked specifications', async () => {
    fetchMock.mockResolvedValueOnce(okResponse({ statuses: sampleStatuses }))
    fetchMock.mockResolvedValueOnce(
      okResponse({
        linkedItems: [
          {
            requirementCount: 3,
            specificationId: 7,
            specificationName: 'IAM specification',
          },
        ],
      }),
    )
    render(<SpecificationItemStatusesClient />)
    await screen.findAllByText('In Progress')
    fireEvent.click(screen.getAllByRole('button', { name: /common\.edit/i })[2])

    expect(await screen.findByText('IAM specification')).toBeInTheDocument()
    expect(
      screen.getByText('specificationItemStatusAdmin.requirementCount'),
    ).toBeInTheDocument()

    fireEvent.change(
      screen.getByRole('textbox', {
        name: /specificationItemStatusAdmin\.definition.+SV/,
      }),
      { target: { value: 'Svensk definition' } },
    )
    fireEvent.change(
      screen.getByRole('textbox', {
        name: /specificationItemStatusAdmin\.definition.+EN/,
      }),
      { target: { value: 'English definition' } },
    )
    fireEvent.change(
      screen.getByLabelText('specificationItemStatusAdmin.colorPicker'),
      { target: { value: '#123456' } },
    )
    fireEvent.change(statusSortOrderInput(), { target: { value: '8' } })
    fireEvent.click(
      screen.getByRole('button', { name: 'specificationItemStatusAdmin.icon' }),
    )

    expect(
      screen.getByRole('textbox', {
        name: /specificationItemStatusAdmin\.definition.+SV/,
      }),
    ).toHaveValue('Svensk definition')
    expect(
      screen.getByRole('textbox', {
        name: /specificationItemStatusAdmin\.definition.+EN/,
      }),
    ).toHaveValue('English definition')
    expect(statusSortOrderInput()).toHaveValue(8)
  })

  it('keeps a dirty form open when cancellation is declined', async () => {
    confirmMock.mockResolvedValue(false)
    render(<SpecificationItemStatusesClient />)
    await screen.findAllByText('Included')
    fireEvent.click(screen.getAllByRole('button', { name: /common\.edit/i })[1])
    fireEvent.change(statusNameEnInput(), {
      target: { value: 'Changed included status' },
    })

    fireEvent.click(screen.getByRole('button', { name: /common\.cancel/i }))

    await waitFor(() => expect(confirmMock).toHaveBeenCalledOnce())
    expect(statusNameEnInput()).toHaveValue('Changed included status')
  })

  it('shows the linked-item fallback after an unexpected lookup failure', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    fetchMock
      .mockResolvedValueOnce(okResponse({ statuses: sampleStatuses }))
      .mockRejectedValueOnce(new Error('network unavailable'))
    render(<SpecificationItemStatusesClient />)
    await screen.findAllByText('Included')

    fireEvent.click(screen.getAllByRole('button', { name: /common\.edit/i })[1])

    expect(await screen.findByRole('alert')).toHaveTextContent('common.error')
  })
})
