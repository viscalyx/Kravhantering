import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const i18nState = vi.hoisted(() => ({ commonSuffix: '' }))
const confirmMock = vi.fn()

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: (ns?: string) => (key: string) =>
    ns ? `${ns}.${key}${ns === 'common' ? i18nState.commonSuffix : ''}` : key,
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

import RequirementPackagesClient from '@/app/[locale]/requirement-packages/requirement-packages-client'

const sampleRequirementPackages = [
  {
    description: 'Requirements for mobile access and responsive flows.',
    descriptionEn: 'Requirements for mobile access and responsive flows.',
    descriptionSv: 'Requirements for mobile access and responsive flows.',
    id: 1,
    isArchived: false,
    leadDisplayName: 'Anna Owner',
    leadHsaId: 'SE5560000001-anna1',
    linkedRequirementCount: 0,
    name: 'Mobile use',
    nameEn: 'Mobile use',
    nameSv: 'Mobile use',
  },
]

const requirementPackageNameInput = () =>
  screen.getByRole('textbox', { name: /requirementPackage\.name/ })
const requirementPackageLeadHsaIdInput = () =>
  screen.getByRole('textbox', { name: /requirementPackage\.leadHsaId/ })
const requirementPackageLeadDisplayNameInput = () =>
  screen.getByRole('textbox', {
    name: /requirementPackage\.leadDisplayName/,
  })

function setupRequirementPackageMocks(
  requirementPackageDetailResponse: () => Promise<unknown> | unknown,
) {
  fetchMock.mockImplementation(async (url: string) => {
    if (url.startsWith('/api/requirement-packages?')) {
      return okJson({ requirementPackages: sampleRequirementPackages })
    }
    if (url === '/api/requirement-packages/1')
      return requirementPackageDetailResponse()
    return okJson({})
  })
}

const linkedRequirement = {
  archiveInitiatedAt: null,
  description: 'Linked package requirement',
  id: 10,
  statusColor: '#f59e0b',
  statusId: 2,
  statusNameEn: 'Review',
  statusNameSv: 'Granskning',
  uniqueId: 'REQ-10',
  versionNumber: 4,
}

describe('RequirementPackagesClient', () => {
  afterEach(cleanup)

  beforeEach(() => {
    vi.clearAllMocks()
    i18nState.commonSuffix = ''
    fetchMock.mockImplementation(async (url: string) => {
      if (url.startsWith('/api/requirement-packages?')) {
        return okJson({ requirementPackages: sampleRequirementPackages })
      }
      return okJson({})
    })
  })

  it('renders heading and create button', async () => {
    render(<RequirementPackagesClient />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'nav.requirementPackages',
    )
    const createButton = await screen.findByRole('button', {
      name: /requirementPackage.newRequirementPackage/i,
    })
    expect(createButton).toBeInTheDocument()
    expect(createButton).toHaveAttribute('data-floating-action-id', 'create')
    await waitFor(() => {
      expect(screen.getByText('Mobile use')).toBeInTheDocument()
    })
  })

  it('fetches and displays requirementPackages', async () => {
    render(<RequirementPackagesClient />)
    await waitFor(() => {
      expect(screen.getByText('Mobile use')).toBeInTheDocument()
    })
    expect(
      screen.getByText('Requirements for mobile access and responsive flows.'),
    ).toBeInTheDocument()
  })

  it('shows loading text initially', () => {
    fetchMock.mockReturnValue(new Promise(() => {}))
    render(<RequirementPackagesClient />)
    expect(screen.getByText('common.loading')).toBeInTheDocument()
  })

  it('renders an empty-state row with a create CTA', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.startsWith('/api/requirement-packages?')) {
        return okJson({ requirementPackages: [] })
      }
      return okJson({})
    })

    render(<RequirementPackagesClient />)

    const emptyState = await screen.findByText('requirementPackage.emptyState')
    expect(emptyState.closest('td')).toHaveAttribute('colspan', '6')

    const createButtons = screen.getAllByRole('button', {
      name: /common\.create/i,
    })
    expect(createButtons).toHaveLength(1)

    fireEvent.click(createButtons[0])

    expect(
      screen.getByRole('dialog', {
        name: /requirementPackage\.newRequirementPackage/i,
      }),
    ).toBeInTheDocument()
    expect(requirementPackageNameInput()).toBeInTheDocument()
    expect(requirementPackageLeadHsaIdInput()).toBeInTheDocument()
    expect(requirementPackageLeadDisplayNameInput()).toBeInTheDocument()
  })

  it('opens create form', async () => {
    render(<RequirementPackagesClient />)
    await waitFor(() => {
      expect(screen.getByText('Mobile use')).toBeInTheDocument()
    })
    fireEvent.click(
      await screen.findByRole('button', {
        name: /requirementPackage.newRequirementPackage/i,
      }),
    )
    expect(
      screen.getByRole('dialog', {
        name: /requirementPackage\.newRequirementPackage/i,
      }),
    ).toBeInTheDocument()
    expect(requirementPackageNameInput()).toBeInTheDocument()
    expect(requirementPackageLeadHsaIdInput()).toBeInTheDocument()
    expect(requirementPackageLeadDisplayNameInput()).toBeInTheDocument()
    const nameHelpButton = screen.getByRole('button', {
      name: 'common.help: requirementPackage.name',
    })
    fireEvent.click(nameHelpButton)
    expect(nameHelpButton).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('requirementPackage.nameHelp')).toBeInTheDocument()
    expect(
      screen.getByRole('button', {
        name: 'common.help: requirementPackage.leadHsaId',
      }),
    ).toBeInTheDocument()
  })

  it('does not fetch owner options for package leads', async () => {
    render(<RequirementPackagesClient />)
    await waitFor(() => {
      expect(screen.getByText('Mobile use')).toBeInTheDocument()
    })

    fireEvent.click(
      await screen.findByRole('button', {
        name: /requirementPackage.newRequirementPackage/i,
      }),
    )

    expect(
      fetchMock.mock.calls.some(([url]) => String(url) === '/api/owners/all'),
    ).toBe(false)
  })

  it('submits create form', async () => {
    render(<RequirementPackagesClient />)
    await waitFor(() => {
      expect(screen.getByText('Mobile use')).toBeInTheDocument()
    })
    fireEvent.click(
      await screen.findByRole('button', {
        name: /requirementPackage.newRequirementPackage/i,
      }),
    )
    fireEvent.change(requirementPackageNameInput(), {
      target: { value: 'Ny' },
    })
    fireEvent.change(requirementPackageLeadHsaIdInput(), {
      target: { value: 'SE5560000001-lead1' },
    })
    fireEvent.change(requirementPackageLeadDisplayNameInput(), {
      target: { value: 'Lead One' },
    })

    fetchMock.mockResolvedValueOnce(okJson({ id: 2 }))
    fetchMock.mockResolvedValueOnce(
      okJson({ requirementPackages: sampleRequirementPackages }),
    )

    fireEvent.click(screen.getByRole('button', { name: /common\.save/i }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/requirement-packages',
        expect.objectContaining({ method: 'POST' }),
      )
    })
  })

  it('opens edit form with existing data', async () => {
    render(<RequirementPackagesClient />)
    await waitFor(() => {
      expect(screen.getByText('Mobile use')).toBeInTheDocument()
    })
    const editButtons = screen.getAllByRole('button', {
      name: /common\.edit/i,
    })
    fireEvent.click(editButtons[0])
    expect((requirementPackageNameInput() as HTMLInputElement).value).toBe(
      'Mobile use',
    )
    await waitFor(() => {
      expect(screen.getByText('common.noneAvailable')).toBeInTheDocument()
    })
  })

  it('marks linked requirement loading as a status', async () => {
    setupRequirementPackageMocks(() => new Promise(() => {}))

    render(<RequirementPackagesClient />)
    await waitFor(() => {
      expect(screen.getByText('Mobile use')).toBeInTheDocument()
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
    setupRequirementPackageMocks(notOk)

    render(<RequirementPackagesClient />)
    await waitFor(() => {
      expect(screen.getByText('Mobile use')).toBeInTheDocument()
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

  it('renders archiving review status for linked package requirements', async () => {
    setupRequirementPackageMocks(() =>
      okJson({
        linkedRequirements: [
          {
            ...linkedRequirement,
            archiveInitiatedAt: '2026-05-15T09:30:00.000Z',
          },
        ],
      }),
    )

    render(<RequirementPackagesClient />)
    await waitFor(() => {
      expect(screen.getByText('Mobile use')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /common\.edit/i }))

    await waitFor(() => {
      expect(
        screen.getByText('requirement.statusLabel.Arkiveringsgranskning'),
      ).toBeInTheDocument()
    })
    expect(screen.queryByText('Review')).not.toBeInTheDocument()
  })

  it('keeps ordinary review status for linked package requirements without archive review', async () => {
    setupRequirementPackageMocks(() =>
      okJson({ linkedRequirements: [linkedRequirement] }),
    )

    render(<RequirementPackagesClient />)
    await waitFor(() => {
      expect(screen.getByText('Mobile use')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /common\.edit/i }))

    await waitFor(() => {
      expect(screen.getByText('Review')).toBeInTheDocument()
    })
    expect(
      screen.queryByText('requirement.statusLabel.Arkiveringsgranskning'),
    ).not.toBeInTheDocument()
  })

  it('closes form on cancel', async () => {
    render(<RequirementPackagesClient />)
    await waitFor(() => {
      expect(screen.getByText('Mobile use')).toBeInTheDocument()
    })
    fireEvent.click(
      await screen.findByRole('button', {
        name: /requirementPackage.newRequirementPackage/i,
      }),
    )
    fireEvent.click(screen.getByRole('button', { name: /common\.cancel/i }))
    expect(
      screen.queryByRole('textbox', {
        name: /requirementPackage\.name/,
      }),
    ).toBeNull()
  })

  it('deletes with confirm', async () => {
    confirmMock.mockResolvedValue(true)
    render(<RequirementPackagesClient />)
    await waitFor(() => {
      expect(screen.getByText('Mobile use')).toBeInTheDocument()
    })

    fetchMock.mockResolvedValueOnce(okJson({}))
    fetchMock.mockResolvedValueOnce(okJson({ requirementPackages: [] }))

    const deleteButtons = screen.getAllByRole('button', {
      name: /common\.delete/i,
    })
    fireEvent.click(deleteButtons[0])

    await waitFor(() => {
      expect(confirmMock).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'danger', icon: 'caution' }),
      )
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/requirement-packages/1',
        expect.objectContaining({ method: 'DELETE' }),
      )
    })
  })
})
