import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: (ns?: string) => (key: string) =>
    ns ? `${ns}.${key}` : key,
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

function okJson(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    statusText: '',
    headers: { 'content-type': 'application/json' },
  })
}

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

import RequirementStatusesClient from '@/app/[locale]/requirement-statuses/requirement-statuses-client'

const sampleStatuses = [
  {
    id: 1,
    nameSv: 'Utkast',
    nameEn: 'Draft',
    color: '#3b82f6',
    iconName: 'PenLine',
    sortOrder: 1,
    isSystem: true,
  },
  {
    id: 10,
    nameSv: 'Anpassad',
    nameEn: 'Custom',
    color: '#22c55e',
    iconName: 'Circle',
    sortOrder: 5,
    isSystem: false,
  },
]

describe('RequirementStatusesClient', () => {
  afterEach(cleanup)

  beforeEach(() => {
    vi.clearAllMocks()
    fetchMock.mockImplementation(() => okJson({ statuses: sampleStatuses }))
  })

  it('renders system statuses without create or delete actions', async () => {
    render(<RequirementStatusesClient />)

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'nav.statuses',
    )
    await waitFor(() => {
      expect(screen.getByText('Draft')).toBeInTheDocument()
    })
    expect(screen.queryByText('Custom')).toBeNull()
    expect(screen.queryByRole('button', { name: /common\.create/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /common\.delete/i })).toBeNull()
    expect(
      screen.getByRole('button', { name: /common\.edit/i }),
    ).toBeInTheDocument()
  })

  it('shows loading text initially', () => {
    fetchMock.mockReturnValue(new Promise(() => {}))

    render(<RequirementStatusesClient />)

    expect(screen.getByText('common.loading')).toBeInTheDocument()
  })

  it('opens edit form with existing system status data', async () => {
    render(<RequirementStatusesClient />)
    await waitFor(() => {
      expect(screen.getByText('Draft')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /common\.edit/i }))

    expect(
      (
        screen.getByRole('textbox', {
          name: /statusMgmt\.nameEnLabel/,
        }) as HTMLInputElement
      ).value,
    ).toBe('Draft')
  })

  it('shows shared light and dark badge previews with exact color metadata', async () => {
    render(<RequirementStatusesClient />)
    await screen.findByText('Draft')

    fireEvent.click(screen.getByRole('button', { name: /common\.edit/i }))

    const preview = screen.getByRole('status', {
      name: 'statusMgmt.themePreview',
    })
    expect(preview).toHaveTextContent('statusMgmt.lightTheme')
    expect(preview).toHaveTextContent('statusMgmt.darkTheme')
    expect(preview).toHaveTextContent('statusMgmt.contrastPass')
    expect(preview.querySelector('[data-badge-theme="light"]')).toHaveAttribute(
      'data-badge-color',
      '#3b82f6',
    )
    expect(
      preview.querySelector('[data-badge-theme="dark"]'),
    ).toHaveTextContent('Draft')
    const colorInput = screen.getByLabelText('statusMgmt.colorHex')
    expect(colorInput).toHaveValue('#3b82f6')
    expect(colorInput).toBeRequired()
    expect(
      document.querySelector('label[for="status-color-hex"]'),
    ).toHaveTextContent('*')
    expect(
      document.querySelector('[data-color-swatch="exact-rgb"]'),
    ).toHaveStyle({ backgroundColor: '#3b82f6' })
    expect(
      document.querySelector(
        '[data-developer-mode-name="theme contrast preview"]',
      ),
    ).toBeTruthy()
  })

  it('keeps Save disabled until the edited color has an exact hex format', async () => {
    render(<RequirementStatusesClient />)
    await screen.findByText('Draft')
    fireEvent.click(screen.getByRole('button', { name: /common\.edit/i }))

    const colorInput = screen.getByLabelText('statusMgmt.colorHex')
    const saveButton = screen.getByRole('button', { name: /common\.save/i })

    fireEvent.change(colorInput, { target: { value: '#abc' } })
    expect(saveButton).toBeDisabled()

    fireEvent.change(colorInput, { target: { value: '#A1B2C3' } })
    expect(saveButton).toBeEnabled()
  })

  it('surfaces an invalid stored color without fallback accent styling', async () => {
    fetchMock.mockResolvedValue(
      okJson({
        statuses: [{ ...sampleStatuses[0], color: 'invalid-color' }],
      }),
    )
    render(<RequirementStatusesClient />)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'statusMgmt.invalidStoredColors',
    )
    fireEvent.click(screen.getByRole('button', { name: /common\.edit/i }))
    expect(screen.getByLabelText('statusMgmt.colorHex')).toHaveValue(
      'invalid-color',
    )
    expect(screen.getByLabelText('statusMgmt.colorHex')).toHaveAttribute(
      'aria-invalid',
      'true',
    )
    expect(screen.getByRole('status')).toHaveTextContent(
      'statusMgmt.invalidColorWarning',
    )
    expect(document.querySelector('[data-color-swatch="exact-rgb"]')).toBeNull()
    expect(document.querySelector('[style*="invalid-color"]')).toBeNull()
  })

  it('closes edit form on cancel', async () => {
    render(<RequirementStatusesClient />)
    await waitFor(() => {
      expect(screen.getByText('Draft')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /common\.edit/i }))
    fireEvent.click(screen.getByRole('button', { name: /common\.cancel/i }))

    expect(
      screen.queryByRole('textbox', { name: /statusMgmt\.nameEnLabel/ }),
    ).toBeNull()
  })
})
