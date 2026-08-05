import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  confirm: vi.fn(),
  readResponseMessage: vi.fn(),
}))

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: (namespace: string) => (key: string) =>
    `${namespace}.${key}`,
}))

vi.mock('@/components/ConfirmModal', () => ({
  useConfirmModal: () => ({ confirm: state.confirm }),
}))

vi.mock('@/components/FormModal', () => ({
  default: ({ children, open }: { children: ReactNode; open: boolean }) =>
    open ? <div>{children}</div> : null,
}))

vi.mock('@/components/FieldLabelWithHelp', () => ({
  default: ({ label }: { label: string }) => <span>{label}</span>,
}))

vi.mock('@/components/HsaPersonVerifyField', () => ({
  default: ({
    disabled,
    onHsaIdChange,
    onVerified,
  }: {
    disabled: boolean
    onHsaIdChange: (value: string) => void
    onVerified: (person: {
      displayName: string
      email: string | null
      hsaId: string
    }) => void
  }) => (
    <div>
      <button
        disabled={disabled}
        onClick={() =>
          onVerified({
            displayName: 'Existing Author',
            email: null,
            hsaId: 'SE5560000001-existing',
          })
        }
        type="button"
      >
        Verify existing
      </button>
      <button
        disabled={disabled}
        onClick={() =>
          onVerified({
            displayName: 'New Author',
            email: 'new@example.test',
            hsaId: 'SE5560000001-new',
          })
        }
        type="button"
      >
        Verify new
      </button>
      <button onClick={() => onHsaIdChange('changed')} type="button">
        Change HSA-id
      </button>
    </div>
  ),
}))

vi.mock('@/lib/http/api-fetch', () => ({ apiFetch: state.apiFetch }))
vi.mock('@/lib/http/response-message', () => ({
  readResponseMessage: state.readResponseMessage,
}))

import CoAuthorsManagementModal from '@/components/CoAuthorsManagementModal'

const props = {
  description: 'Description',
  developerModeValue: 'co-authors',
  endpoint: '/api/co-authors',
  hsaIdHelp: 'Help',
  hsaIdLabel: 'HSA-id',
  loadErrorMessage: 'Load failed',
  loadingMessage: 'Loading',
  noCoAuthorsMessage: 'None',
  onClose: vi.fn(),
  open: true,
  purpose: 'requirement_area_co_author' as const,
  removeConfirmMessage: (name: string) => `Remove ${name}`,
  removeLabel: 'Remove',
  savedCoAuthorsHeading: 'Saved',
  saveErrorMessage: 'Save failed',
  scopeId: 7,
  title: 'Co-authors',
  titleId: 'co-authors-title',
  verifiedDraftMessage: (name: string) => `Verified ${name}`,
}

describe('co-author modal branches', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.confirm.mockResolvedValue(false)
    state.readResponseMessage.mockResolvedValue(null)
  })

  it('resets and renders nothing while closed', () => {
    render(<CoAuthorsManagementModal {...props} open={false} />)
    expect(screen.queryByText('Description')).toBeNull()
    expect(state.apiFetch).not.toHaveBeenCalled()
  })

  it('handles omitted co-authors, duplicate verification, and cancelled removal', async () => {
    state.apiFetch.mockResolvedValue({ json: async () => ({}), ok: true })
    const { rerender } = render(<CoAuthorsManagementModal {...props} />)
    expect(await screen.findByText('None')).toBeInTheDocument()

    state.apiFetch.mockResolvedValue({
      json: async () => ({
        coAuthors: [
          {
            displayName: null,
            email: null,
            hsaId: 'SE5560000001-existing',
          },
        ],
      }),
      ok: true,
    })
    rerender(
      <CoAuthorsManagementModal {...props} endpoint="/api/co-authors-next" />,
    )
    expect(
      await screen.findAllByText('SE5560000001-existing'),
    ).not.toHaveLength(0)
    fireEvent.click(screen.getByRole('button', { name: 'Verify existing' }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    expect(state.confirm).toHaveBeenCalled()
    expect(state.apiFetch).not.toHaveBeenCalledWith(
      '/api/co-authors-next',
      expect.objectContaining({ method: 'PUT' }),
    )
  })

  it('falls back for non-Error load and save failures and keeps verified context', async () => {
    state.apiFetch.mockRejectedValueOnce('load failure')
    const { rerender } = render(<CoAuthorsManagementModal {...props} />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Load failed')

    state.apiFetch
      .mockResolvedValueOnce({
        json: async () => ({ coAuthors: [] }),
        ok: true,
      })
      .mockRejectedValueOnce('save failure')
    rerender(
      <CoAuthorsManagementModal {...props} endpoint="/api/co-authors-save" />,
    )
    await waitFor(() => expect(screen.getByText('None')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Verify new' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Save failed')
    expect(screen.getByText('Verified New Author')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Change HSA-id' }))
    expect(screen.queryByText('Verified New Author')).toBeNull()
  })

  it('shows a safe fallback when a failed load has no response message', async () => {
    vi.stubGlobal('crypto', {})
    state.apiFetch.mockResolvedValue({ ok: false })
    state.readResponseMessage.mockResolvedValueOnce(null)
    render(<CoAuthorsManagementModal {...props} />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Load failed')
    expect(state.readResponseMessage).toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('renders loaded co-authors in HSA-id order with an HSA-id name fallback', async () => {
    state.apiFetch.mockResolvedValue({
      json: async () => ({
        coAuthors: [
          {
            displayName: 'Second Author',
            email: null,
            hsaId: 'SE5560000001-zeta',
          },
          {
            displayName: null,
            email: null,
            hsaId: 'SE5560000001-alpha',
          },
        ],
      }),
      ok: true,
    })
    render(<CoAuthorsManagementModal {...props} />)
    await screen.findByText('Second Author')
    const rows = screen.getAllByRole('row').slice(1)
    expect(rows[0]).toHaveTextContent('SE5560000001-alpha')
    expect(rows[1]).toHaveTextContent('SE5560000001-zeta')
    expect(rows[1]).toHaveTextContent('Second Author')
  })

  it('ignores a rejected load after the request is aborted', async () => {
    let rejectLoad!: (reason: unknown) => void
    state.apiFetch.mockReturnValue(
      new Promise((_resolve, reject) => {
        rejectLoad = reject
      }),
    )
    const { unmount } = render(<CoAuthorsManagementModal {...props} />)
    unmount()
    await act(async () => rejectLoad(new Error('aborted request')))
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
