import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const confirmMock = vi.fn()

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
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
  useConfirmModal: () => ({ confirm: confirmMock }),
}))

vi.mock('@/components/StatusBadge', () => ({
  default: ({ label }: { label: string }) => <span>{label}</span>,
}))

function okJson(body: unknown) {
  return { ok: true, json: async () => body }
}
function notOk(body: unknown = { error: 'Bad request' }) {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
    status: 400,
    statusText: 'Bad Request',
  })
}

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

import UsageScenariosClient from '@/app/[locale]/usage-scenarios/usage-scenarios-client'

const sampleScenarios = [
  {
    id: 1,
    nameSv: 'Scenario A sv',
    nameEn: 'Scenario A',
    descriptionSv: 'Desc sv',
    descriptionEn: 'Desc en',
    ownerId: null,
  },
]

const scenarioNameSvInput = () =>
  screen.getByRole('textbox', { name: /scenario\.nameSvLabel/ })
const scenarioNameEnInput = () =>
  screen.getByRole('textbox', { name: /scenario\.nameEnLabel/ })

describe('UsageScenariosClient', () => {
  afterEach(cleanup)

  beforeEach(() => {
    vi.clearAllMocks()
    fetchMock.mockResolvedValue(okJson({ scenarios: sampleScenarios }))
  })

  it('renders heading and create button', async () => {
    render(<UsageScenariosClient />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'nav.scenarios',
    )
    expect(
      screen.getByRole('button', { name: /common\.create/i }),
    ).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByText('Scenario A')).toBeInTheDocument()
    })
  })

  it('fetches and displays scenarios', async () => {
    render(<UsageScenariosClient />)
    await waitFor(() => {
      expect(screen.getByText('Scenario A')).toBeInTheDocument()
    })
    expect(screen.getByText('Desc en')).toBeInTheDocument()
  })

  it('shows loading text initially', () => {
    fetchMock.mockReturnValue(new Promise(() => {}))
    render(<UsageScenariosClient />)
    expect(screen.getByText('common.loading')).toBeInTheDocument()
  })

  it('opens create form', async () => {
    render(<UsageScenariosClient />)
    await waitFor(() => {
      expect(screen.getByText('Scenario A')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('button', { name: /common\.create/i }))
    expect(scenarioNameSvInput()).toBeInTheDocument()
    expect(scenarioNameEnInput()).toBeInTheDocument()
    const nameHelpButton = screen.getByRole('button', {
      name: 'common.help: scenario.nameSvLabel',
    })
    fireEvent.click(nameHelpButton)
    expect(nameHelpButton).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('scenario.nameSvHelp')).toBeInTheDocument()
    expect(
      screen.getByRole('button', {
        name: 'common.help: scenario.owner',
      }),
    ).toBeInTheDocument()
  })

  it('submits create form', async () => {
    render(<UsageScenariosClient />)
    await waitFor(() => {
      expect(screen.getByText('Scenario A')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('button', { name: /common\.create/i }))
    fireEvent.change(scenarioNameSvInput(), {
      target: { value: 'Ny' },
    })
    fireEvent.change(scenarioNameEnInput(), {
      target: { value: 'New' },
    })

    fetchMock.mockResolvedValueOnce(okJson({ id: 2 }))
    fetchMock.mockResolvedValueOnce(okJson({ scenarios: sampleScenarios }))

    fireEvent.click(screen.getByRole('button', { name: /common\.save/i }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/usage-scenarios',
        expect.objectContaining({ method: 'POST' }),
      )
    })
  })

  it('opens edit form with existing data', async () => {
    render(<UsageScenariosClient />)
    await waitFor(() => {
      expect(screen.getByText('Scenario A')).toBeInTheDocument()
    })
    const editButtons = screen.getAllByRole('button', {
      name: /common\.edit/i,
    })
    fireEvent.click(editButtons[0])
    expect((scenarioNameEnInput() as HTMLInputElement).value).toBe('Scenario A')
    await waitFor(() => {
      expect(screen.getByText('common.noneAvailable')).toBeInTheDocument()
    })
  })

  it('marks linked requirement loading as a status', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/usage-scenarios') {
        return okJson({ scenarios: sampleScenarios })
      }
      if (url === '/api/owners/all') return okJson({ owners: [] })
      if (url === '/api/usage-scenarios/1') return new Promise(() => {})
      return okJson({})
    })

    render(<UsageScenariosClient />)
    await waitFor(() => {
      expect(screen.getByText('Scenario A')).toBeInTheDocument()
    })

    const editButtons = screen.getAllByRole('button', {
      name: /common\.edit/i,
    })
    fireEvent.click(editButtons[0])

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('common.loading')
    })
  })

  it('shows an error instead of an empty state when linked requirements fail to load', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/usage-scenarios') {
        return okJson({ scenarios: sampleScenarios })
      }
      if (url === '/api/owners/all') return okJson({ owners: [] })
      if (url === '/api/usage-scenarios/1') return notOk()
      return okJson({})
    })

    render(<UsageScenariosClient />)
    await waitFor(() => {
      expect(screen.getByText('Scenario A')).toBeInTheDocument()
    })

    const editButtons = screen.getAllByRole('button', {
      name: /common\.edit/i,
    })
    fireEvent.click(editButtons[0])

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('common.error')
    })
    expect(screen.queryByText('common.noneAvailable')).toBeNull()
  })

  it('closes form on cancel', async () => {
    render(<UsageScenariosClient />)
    await waitFor(() => {
      expect(screen.getByText('Scenario A')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('button', { name: /common\.create/i }))
    fireEvent.click(screen.getByRole('button', { name: /common\.cancel/i }))
    expect(
      screen.queryByRole('textbox', { name: /scenario\.nameSvLabel/ }),
    ).toBeNull()
  })

  it('deletes with confirm', async () => {
    confirmMock.mockResolvedValue(true)
    render(<UsageScenariosClient />)
    await waitFor(() => {
      expect(screen.getByText('Scenario A')).toBeInTheDocument()
    })

    fetchMock.mockResolvedValueOnce(okJson({}))
    fetchMock.mockResolvedValueOnce(okJson({ scenarios: [] }))

    const deleteButtons = screen.getAllByRole('button', {
      name: /common\.delete/i,
    })
    fireEvent.click(deleteButtons[0])

    await waitFor(() => {
      expect(confirmMock).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'danger', icon: 'caution' }),
      )
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/usage-scenarios/1',
        expect.objectContaining({ method: 'DELETE' }),
      )
    })
  })
})
