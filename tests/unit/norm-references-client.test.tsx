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
      'nav.normReferences',
    )
    expect(
      screen.getByRole('button', { name: /common\.create/i }),
    ).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByText('BBR')).toBeInTheDocument()
    })
  })

  it('opens create form and submits it', async () => {
    render(<NormReferencesClient />)
    await waitFor(() => {
      expect(screen.getByText('BBR')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('button', { name: /common\.create/i }))
    const nameInput = await screen.findByRole('textbox', {
      name: /^normReference\.name \*/,
    })
    fireEvent.change(nameInput, {
      target: { value: 'New norm' },
    })
    fireEvent.change(
      screen.getByRole('combobox', { name: /^normReference\.type \*/ }),
      {
        target: { value: 'Standard' },
      },
    )
    fireEvent.change(
      screen.getByRole('textbox', { name: /^normReference\.reference \*/ }),
      {
        target: { value: 'Ref 1' },
      },
    )
    fireEvent.change(
      screen.getByRole('textbox', { name: /^normReference\.issuer \*/ }),
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
            description: 'Linked requirement',
            id: 7,
            statusColor: '#22c55e',
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
    fireEvent.click(screen.getByRole('button', { name: /common\.edit bbr/i }))
    const nameInput = (await screen.findByRole('textbox', {
      name: /^normReference\.name \*/,
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
    fireEvent.click(screen.getByRole('button', { name: /common\.create/i }))
    const nameInput = await screen.findByRole('textbox', {
      name: /^normReference\.name \*/,
    })
    fireEvent.change(nameInput, {
      target: { value: 'Dirty norm' },
    })
    fireEvent.click(screen.getByRole('button', { name: /common\.create/i }))

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
          name: /^normReference\.name \*/,
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

    fireEvent.click(screen.getByRole('button', { name: /common\.delete bbr/i }))

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
})
