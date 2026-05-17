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

import RequirementPackagesClient from '@/app/[locale]/requirement-packages/requirement-packages-client'

const sampleRequirementPackages = [
  {
    id: 1,
    nameSv: 'Mobil användning',
    nameEn: 'Mobile use',
    descriptionSv: 'Krav för mobil åtkomst och responsiva flöden.',
    descriptionEn: 'Requirements for mobile access and responsive flows.',
    ownerId: null,
  },
]

const sampleOwners = [
  { id: 1, firstName: 'Anna', lastName: 'Owner' },
  { id: 2, firstName: 'Erik', lastName: 'Editor' },
]

const requirementPackageNameSvInput = () =>
  screen.getByRole('textbox', { name: /requirementPackage\.nameSvLabel/ })
const requirementPackageNameEnInput = () =>
  screen.getByRole('textbox', { name: /requirementPackage\.nameEnLabel/ })

function setupRequirementPackageMocks(
  requirementPackageDetailResponse: () => Promise<unknown> | unknown,
) {
  fetchMock.mockImplementation(async (url: string) => {
    if (url === '/api/requirement-packages') {
      return okJson({ requirementPackages: sampleRequirementPackages })
    }
    if (url === '/api/owners/all') return okJson({ owners: [] })
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
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/requirement-packages') {
        return okJson({ requirementPackages: sampleRequirementPackages })
      }
      if (url === '/api/owners/all') return okJson({ owners: sampleOwners })
      return okJson({})
    })
  })

  it('renders heading and create button', async () => {
    render(<RequirementPackagesClient />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'nav.requirementPackages',
    )
    expect(
      screen.getByRole('button', { name: /common\.create/i }),
    ).toBeInTheDocument()
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
      if (url === '/api/requirement-packages') {
        return okJson({ requirementPackages: [] })
      }
      if (url === '/api/owners/all') return okJson({ owners: sampleOwners })
      return okJson({})
    })

    render(<RequirementPackagesClient />)

    const emptyState = await screen.findByText('requirementPackage.emptyState')
    expect(emptyState.closest('td')).toHaveAttribute('colspan', '5')

    const createButtons = screen.getAllByRole('button', {
      name: /common\.create/i,
    })
    expect(createButtons).toHaveLength(2)

    fireEvent.click(createButtons[1])

    expect(requirementPackageNameSvInput()).toBeInTheDocument()
    expect(requirementPackageNameEnInput()).toBeInTheDocument()
  })

  it('opens create form', async () => {
    render(<RequirementPackagesClient />)
    await waitFor(() => {
      expect(screen.getByText('Mobile use')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('button', { name: /common\.create/i }))
    expect(requirementPackageNameSvInput()).toBeInTheDocument()
    expect(requirementPackageNameEnInput()).toBeInTheDocument()
    const nameHelpButton = screen.getByRole('button', {
      name: 'common.help: requirementPackage.nameSvLabel',
    })
    fireEvent.click(nameHelpButton)
    expect(nameHelpButton).toHaveAttribute('aria-expanded', 'true')
    expect(
      screen.getByText('requirementPackage.nameSvHelp'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', {
        name: 'common.help: requirementPackage.owner',
      }),
    ).toBeInTheDocument()
  })

  it('renders owner options when owner fetch succeeds', async () => {
    render(<RequirementPackagesClient />)
    await waitFor(() => {
      expect(screen.getByText('Mobile use')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /common\.create/i }))

    await waitFor(() => {
      expect(
        screen.getByRole('option', { name: 'Anna Owner' }),
      ).toBeInTheDocument()
    })
    expect(
      screen.getByRole('option', { name: 'Erik Editor' }),
    ).toBeInTheDocument()
  })

  it('disables owner select while owner options are loading', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/requirement-packages') {
        return okJson({ requirementPackages: sampleRequirementPackages })
      }
      if (url === '/api/owners/all') return new Promise(() => {})
      return okJson({})
    })

    render(<RequirementPackagesClient />)
    await waitFor(() => {
      expect(screen.getByText('Mobile use')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /common\.create/i }))

    expect(
      screen.getByRole('combobox', { name: /requirementPackage\.owner/ }),
    ).toBeDisabled()
    expect(screen.getByRole('status')).toHaveTextContent('common.loading')
  })

  it('shows an owner loading error when owner fetch fails', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/requirement-packages') {
        return okJson({ requirementPackages: sampleRequirementPackages })
      }
      if (url === '/api/owners/all') return notOk()
      return okJson({})
    })

    render(<RequirementPackagesClient />)
    await waitFor(() => {
      expect(screen.getByText('Mobile use')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /common\.create/i }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'common.ownerLoadError',
      )
    })
  })

  it('submits create form', async () => {
    render(<RequirementPackagesClient />)
    await waitFor(() => {
      expect(screen.getByText('Mobile use')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('button', { name: /common\.create/i }))
    fireEvent.change(requirementPackageNameSvInput(), {
      target: { value: 'Ny' },
    })
    fireEvent.change(requirementPackageNameEnInput(), {
      target: { value: 'New' },
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
    expect((requirementPackageNameEnInput() as HTMLInputElement).value).toBe(
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
    fireEvent.click(screen.getByRole('button', { name: /common\.create/i }))
    fireEvent.click(screen.getByRole('button', { name: /common\.cancel/i }))
    expect(
      screen.queryByRole('textbox', {
        name: /requirementPackage\.nameSvLabel/,
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
