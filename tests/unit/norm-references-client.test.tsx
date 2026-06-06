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
  useTranslations: (ns?: string) =>
    Object.assign((key: string) => (ns ? `${ns}.${key}` : key), {
      rich: (key: string) => (ns ? `${ns}.${key}` : key),
    }),
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

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

import NormReferencesClient from '@/app/[locale]/norm-references/norm-references-client'

const sampleNormReferences = [
  {
    id: 1,
    isArchived: false,
    issuer: 'Boverket',
    linkedRequirementCount: 1,
    name: 'BBR',
    normReferenceId: 'Reference 2011-6',
    reference: 'Section 1',
    type: 'Regulation',
    updatedAt: '2026-05-02T08:00:00.000Z',
    uri: null,
    version: '29',
  },
]

describe('NormReferencesClient', () => {
  afterEach(cleanup)

  beforeEach(() => {
    vi.clearAllMocks()
    fetchMock.mockResolvedValue(
      okJson({ normReferences: sampleNormReferences }),
    )
  })

  it('renders heading and create button', async () => {
    render(<NormReferencesClient />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'nav.normLibrary',
    )
    const createButton = screen.getByRole('button', {
      name: /normReference\.newNormReference/i,
    })
    expect(createButton).toBeInTheDocument()
    expect(createButton).toHaveAttribute('data-floating-action-id', 'create')
    await waitFor(() => {
      expect(screen.getByText('BBR')).toBeInTheDocument()
    })
  })

  it('renders an empty-state row with a create CTA', async () => {
    fetchMock.mockResolvedValue(okJson({ normReferences: [] }))

    render(<NormReferencesClient />)

    const emptyState = await screen.findByText('normReference.emptyState')
    expect(emptyState.closest('td')).toHaveAttribute('colspan', '9')

    const createButtons = [
      screen.getByRole('button', {
        name: /normReference\.newNormReference/i,
      }),
      screen.getByRole('button', {
        name: /common\.create/i,
      }),
    ]

    fireEvent.click(createButtons[1])

    expect(
      await screen.findByRole('textbox', { name: /^normReference\.name/ }),
    ).toBeInTheDocument()
  })

  it('shows a clickable external URI icon for browser-link URIs in the list', async () => {
    const longName = 'Tillgänglighetskrav på IKT-produkter och IKT-tjänster'
    fetchMock.mockResolvedValue(
      okJson({
        normReferences: [
          {
            ...sampleNormReferences[0],
            name: longName,
            uri: '  https://example.test/bbr  ',
          },
        ],
      }),
    )

    render(<NormReferencesClient />)

    const link = await screen.findByRole('link', {
      name: /normReference\.openUri/i,
    })

    expect(link).toHaveAttribute('href', 'https://example.test/bbr')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    expect(link).toHaveAttribute('title', 'normReference.openUri')
    expect(screen.getByText(longName)).toHaveClass('break-words')
    expect(screen.getByText(longName).parentElement).toHaveClass(
      'grid',
      'grid-cols-[minmax(0,1fr)_auto]',
      'items-center',
    )
  })

  it('does not show external URI icons for empty or non-browser-link URIs', async () => {
    fetchMock.mockResolvedValue(
      okJson({
        normReferences: [
          { ...sampleNormReferences[0], id: 1, name: 'Null URI', uri: null },
          { ...sampleNormReferences[0], id: 2, name: 'Empty URI', uri: '' },
          {
            ...sampleNormReferences[0],
            id: 3,
            name: 'Text URI',
            uri: 'See https://example.test/bbr',
          },
          {
            ...sampleNormReferences[0],
            id: 4,
            name: 'Missing scheme URI',
            uri: '://example.test/bbr',
          },
          {
            ...sampleNormReferences[0],
            id: 5,
            name: 'Invalid scheme URI',
            uri: '1https://example.test/bbr',
          },
        ],
      }),
    )

    render(<NormReferencesClient />)

    await screen.findByText('Null URI')

    expect(
      screen.queryByRole('link', { name: /normReference\.openUri/i }),
    ).not.toBeInTheDocument()
  })

  it('updates the external URI icon in the modal when the URI becomes a browser link', async () => {
    render(<NormReferencesClient />)
    await waitFor(() => {
      expect(screen.getByText('BBR')).toBeInTheDocument()
    })

    fireEvent.click(
      screen.getByRole('button', {
        name: /normReference\.newNormReference/i,
      }),
    )

    const uriInput = await screen.findByLabelText(/^normReference\.uri/)
    expect(
      screen.queryByRole('link', { name: /normReference\.openUri/i }),
    ).not.toBeInTheDocument()

    fireEvent.change(uriInput, {
      target: { value: 'See https://example.test/bbr' },
    })
    expect(
      screen.queryByRole('link', { name: /normReference\.openUri/i }),
    ).not.toBeInTheDocument()

    fireEvent.change(uriInput, {
      target: { value: '  ftp://example.test/bbr  ' },
    })
    expect(
      screen.queryByRole('link', { name: /normReference\.openUri/i }),
    ).not.toBeInTheDocument()

    fireEvent.change(uriInput, {
      target: { value: '  https://example.test/bbr  ' },
    })

    const link = screen.getByRole('link', {
      name: /normReference\.openUri/i,
    })
    expect(link).toHaveAttribute('href', 'https://example.test/bbr')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('opens create form and submits it', async () => {
    render(<NormReferencesClient />)
    await waitFor(() => {
      expect(screen.getByText('BBR')).toBeInTheDocument()
    })
    fireEvent.click(
      screen.getByRole('button', {
        name: /normReference\.newNormReference/i,
      }),
    )
    const nameInput = await screen.findByRole('textbox', {
      name: /^normReference\.name/,
    })
    fireEvent.change(nameInput, {
      target: { value: 'New norm' },
    })
    fireEvent.change(
      screen.getByRole('combobox', { name: /^normReference\.type/ }),
      {
        target: { value: 'Standard' },
      },
    )
    fireEvent.change(
      screen.getByRole('textbox', { name: /^normReference\.reference/ }),
      {
        target: { value: 'Ref 1' },
      },
    )
    fireEvent.change(
      screen.getByRole('textbox', { name: /^normReference\.issuer/ }),
      {
        target: { value: 'Issuer' },
      },
    )

    fetchMock.mockResolvedValueOnce(okJson({ id: 2 }))
    fetchMock.mockResolvedValueOnce(
      okJson({ normReferences: sampleNormReferences }),
    )

    fireEvent.click(screen.getByRole('button', { name: /common\.save/i }))
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/norm-references',
        expect.objectContaining({ method: 'POST' }),
      )
    })
  })

  it('opens edit form and fetches linked requirements', async () => {
    fetchMock.mockResolvedValueOnce(
      okJson({ normReferences: sampleNormReferences }),
    )
    fetchMock.mockResolvedValueOnce(
      okJson({
        linkedRequirements: [
          {
            archiveInitiatedAt: null,
            description: 'Linked requirement',
            id: 7,
            statusColor: '#22c55e',
            statusIconName: null,
            statusId: 3,
            statusNameEn: 'Published',
            statusNameSv: 'Publicerad',
            uniqueId: 'REQ-1',
            versionNumber: 2,
          },
        ],
      }),
    )
    render(<NormReferencesClient />)
    await waitFor(() => {
      expect(screen.getByText('BBR')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('button', { name: /common\.edit/i }))
    const nameInput = (await screen.findByRole('textbox', {
      name: /^normReference\.name/,
    })) as HTMLInputElement
    expect(nameInput.value).toBe('BBR')
    await waitFor(() => {
      expect(screen.getByText('REQ-1')).toBeInTheDocument()
    })
  })

  it('guards dirty form before switching to create', async () => {
    confirmMock.mockResolvedValue(false)
    render(<NormReferencesClient />)
    await waitFor(() => {
      expect(screen.getByText('BBR')).toBeInTheDocument()
    })
    fireEvent.click(
      screen.getByRole('button', {
        name: /normReference\.newNormReference/i,
      }),
    )
    const nameInput = await screen.findByRole('textbox', {
      name: /^normReference\.name/,
    })
    fireEvent.change(nameInput, {
      target: { value: 'Dirty norm' },
    })
    fireEvent.click(
      screen.getByRole('button', {
        name: /normReference\.newNormReference/i,
      }),
    )

    await waitFor(() => {
      expect(confirmMock).toHaveBeenCalledWith(
        expect.objectContaining({
          icon: 'caution',
          message: 'common.unsavedChangesConfirm',
          variant: 'danger',
        }),
      )
    })
    expect(
      (
        screen.getByRole('textbox', {
          name: /^normReference\.name/,
        }) as HTMLInputElement
      ).value,
    ).toBe('Dirty norm')
  })

  it('deletes with confirm', async () => {
    confirmMock.mockResolvedValue(true)
    render(<NormReferencesClient />)
    await waitFor(() => {
      expect(screen.getByText('BBR')).toBeInTheDocument()
    })

    fetchMock.mockResolvedValueOnce(okJson({}))
    fetchMock.mockResolvedValueOnce(okJson({ normReferences: [] }))

    fireEvent.click(screen.getByRole('button', { name: /common\.delete/i }))

    await waitFor(() => {
      expect(confirmMock).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'danger', icon: 'caution' }),
      )
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/norm-references/1',
        expect.objectContaining({ method: 'DELETE' }),
      )
    })
  })

  it('archives and reactivates from compact icon actions', async () => {
    confirmMock.mockResolvedValue(true)
    render(<NormReferencesClient />)
    await waitFor(() => {
      expect(screen.getByText('BBR')).toBeInTheDocument()
    })

    fetchMock.mockResolvedValueOnce(
      okJson({ ...sampleNormReferences[0], isArchived: true }),
    )
    fetchMock.mockResolvedValueOnce(
      okJson({
        normReferences: [{ ...sampleNormReferences[0], isArchived: true }],
      }),
    )

    fireEvent.click(
      screen.getByRole('button', { name: /normReference\.archive/i }),
    )

    await waitFor(() => {
      expect(confirmMock).toHaveBeenCalledWith(
        expect.objectContaining({
          icon: 'caution',
          message: 'normReference.archiveConfirm',
          variant: 'danger',
        }),
      )
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/norm-reference-actions/1/archive',
        expect.objectContaining({ method: 'POST' }),
      )
    })

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /normReference\.reactivate/i }),
      ).toBeInTheDocument()
    })

    fetchMock.mockResolvedValueOnce(okJson(sampleNormReferences[0]))
    fetchMock.mockResolvedValueOnce(
      okJson({ normReferences: sampleNormReferences }),
    )

    fireEvent.click(
      screen.getByRole('button', { name: /normReference\.reactivate/i }),
    )

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/norm-references/1/reactivate',
        expect.objectContaining({ method: 'POST' }),
      )
    })
  })

  it('does not archive when the confirmation is cancelled', async () => {
    confirmMock.mockResolvedValue(false)
    render(<NormReferencesClient />)
    await waitFor(() => {
      expect(screen.getByText('BBR')).toBeInTheDocument()
    })

    fireEvent.click(
      screen.getByRole('button', { name: /normReference\.archive/i }),
    )

    await waitFor(() => {
      expect(confirmMock).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'normReference.archiveConfirm',
          variant: 'danger',
        }),
      )
    })
    expect(fetchMock).not.toHaveBeenCalledWith(
      '/api/norm-reference-actions/1/archive',
      expect.objectContaining({ method: 'POST' }),
    )
  })
})
