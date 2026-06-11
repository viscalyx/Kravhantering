import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import HsaPersonChangeModal from '@/components/HsaPersonChangeModal'

vi.mock('next-intl', () => ({
  useTranslations: (ns?: string) => (key: string) =>
    ns ? `${ns}.${key}` : key,
}))

const baseProps = {
  blockedError: 'Blocked HSA-ID',
  cancelLabel: 'Cancel',
  currentHelp: 'Current help',
  currentHsaId: 'SE5560000001-old1',
  currentInputId: 'current-hsa-id',
  currentLabel: 'Current HSA-ID',
  developerModeValue: 'change person',
  description: 'Change the assigned person.',
  emailLabel: 'Email',
  errorFallback: 'Could not verify',
  fetchingLabel: 'Fetching',
  fetchLabel: 'Fetch',
  inputClassName: 'input',
  invalidError: 'Invalid HSA-ID',
  nameLabel: 'Name',
  newHelp: 'New help',
  newInputId: 'new-hsa-id',
  newLabel: 'New HSA-ID',
  onClose: vi.fn(),
  open: true,
  purpose: 'requirement_package_lead' as const,
  sameError: 'Same HSA-ID',
  submitLabel: 'Change',
  submittingLabel: 'Saving',
  title: 'Change person',
  titleId: 'change-person-title',
  unavailableText: 'Unavailable',
}

describe('HsaPersonChangeModal', () => {
  afterEach(() => {
    vi.clearAllMocks()
    vi.unstubAllGlobals()
  })

  it('validates invalid, same, and blocked HSA-IDs before submit', () => {
    const onSubmit = vi.fn()
    render(
      <HsaPersonChangeModal
        {...baseProps}
        blockedHsaIds={['SE5560000001-block1']}
        onSubmit={onSubmit}
      />,
    )

    const dialog = screen.getByRole('dialog', { name: 'Change person' })
    expect(
      within(dialog).getByRole('textbox', { name: 'Current HSA-ID' }),
    ).toBeDisabled()
    const newInput = within(dialog).getByRole('textbox', {
      name: /New HSA-ID/,
    })
    const submitButton = within(dialog).getByRole('button', {
      name: 'Change',
    })
    expect(submitButton).toBeDisabled()

    fireEvent.change(newInput, { target: { value: 'bad' } })
    expect(within(dialog).getByRole('alert')).toHaveTextContent(
      'Invalid HSA-ID',
    )
    expect(submitButton).toBeDisabled()

    fireEvent.change(newInput, { target: { value: 'SE5560000001-old1' } })
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Same HSA-ID')
    expect(submitButton).toBeDisabled()

    fireEvent.change(newInput, { target: { value: 'SE5560000001-block1' } })
    expect(within(dialog).getByRole('alert')).toHaveTextContent(
      'Blocked HSA-ID',
    )
    expect(submitButton).toBeDisabled()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('lets the refresh button verify the new person and submits it', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            person: {
              displayName: 'Nora New',
              email: 'nora.new@example.test',
              givenName: 'Nora',
              hsaId: 'SE5560000001-new1',
              middleName: null,
              surname: 'New',
            },
          }),
          {
            headers: { 'Content-Type': 'application/json' },
            status: 200,
          },
        ),
    )
    vi.stubGlobal('fetch', fetchMock)
    const onSubmit = vi.fn(async () => ({ ok: true as const }))

    render(<HsaPersonChangeModal {...baseProps} onSubmit={onSubmit} />)

    const dialog = screen.getByRole('dialog', { name: 'Change person' })
    fireEvent.change(
      within(dialog).getByRole('textbox', { name: /New HSA-ID/ }),
      { target: { value: 'SE5560000001-new1' } },
    )
    fireEvent.click(within(dialog).getByRole('button', { name: 'Fetch' }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/requirement-responsibility-people/verify',
        expect.objectContaining({ method: 'POST' }),
      )
      expect(within(dialog).getByDisplayValue('Nora New')).toBeInTheDocument()
    })

    fireEvent.click(within(dialog).getByRole('button', { name: 'Change' }))

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        'SE5560000001-new1',
        expect.objectContaining({
          displayName: 'Nora New',
          hsaId: 'SE5560000001-new1',
        }),
      )
    })
  })
})
