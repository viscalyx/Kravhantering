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
  blockedError: 'Blocked HSA-id',
  cancelLabel: 'Cancel',
  currentHelp: 'Current help',
  currentHsaId: 'SE5560000001-old1',
  currentInputId: 'current-hsa-id',
  currentLabel: 'Current HSA-id',
  developerModeValue: 'change person',
  description: 'Change the assigned person.',
  emailLabel: 'Email',
  errorFallback: 'Could not verify',
  fetchingLabel: 'Fetching',
  fetchLabel: 'Fetch',
  inputClassName: 'input',
  invalidError: 'Invalid HSA-id',
  nameLabel: 'Name',
  newHelp: 'New help',
  newInputId: 'new-hsa-id',
  newLabel: 'New HSA-id',
  onClose: vi.fn(),
  open: true,
  purpose: 'requirement_package_lead' as const,
  sameError: 'Same HSA-id',
  submitLabel: 'Change',
  submittingLabel: 'Saving',
  title: 'Change person',
  titleId: 'change-person-title',
  unavailableText: 'Unavailable',
}

function okJson(body: unknown) {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    status: 200,
  })
}

function prefixPayload(prefix = 'SE5560000001') {
  return {
    prefixes: [
      {
        id: 1,
        isDefault: true,
        label: null,
        prefix,
      },
    ],
  }
}

describe('HsaPersonChangeModal', () => {
  afterEach(() => {
    vi.clearAllMocks()
    vi.unstubAllGlobals()
  })

  it('validates invalid, same, and blocked HSA-id values before submit', async () => {
    const onSubmit = vi.fn()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => okJson(prefixPayload())),
    )
    render(
      <HsaPersonChangeModal
        {...baseProps}
        blockedHsaIds={['SE5560000001-block1']}
        onSubmit={onSubmit}
      />,
    )

    const dialog = screen.getByRole('dialog', { name: 'Change person' })
    expect(
      within(dialog).getByRole('textbox', { name: 'Current HSA-id' }),
    ).toBeDisabled()
    const newInput = within(dialog).getByRole('textbox', {
      name: /New HSA-id/,
    })
    const submitButton = within(dialog).getByRole('button', {
      name: 'Change',
    })
    const cancelButton = within(dialog).getByRole('button', { name: 'Cancel' })
    expect(cancelButton).toHaveClass('min-h-11')
    expect(cancelButton).toHaveClass('min-w-11')
    expect(submitButton).toBeDisabled()
    await waitFor(() => {
      expect(newInput).toBeEnabled()
    })

    fireEvent.change(newInput, { target: { value: 'bad!' } })
    expect(within(dialog).getByRole('alert')).toHaveTextContent(
      'Invalid HSA-id',
    )
    expect(submitButton).toBeDisabled()

    fireEvent.change(newInput, { target: { value: 'old1' } })
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Same HSA-id')
    expect(submitButton).toBeDisabled()

    fireEvent.change(newInput, { target: { value: 'block1' } })
    expect(within(dialog).getByRole('alert')).toHaveTextContent(
      'Blocked HSA-id',
    )
    expect(submitButton).toBeDisabled()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('lets the refresh button verify the new person and submits it', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url === '/api/hsa-id-prefixes') return okJson(prefixPayload())
      return okJson({
        person: {
          displayName: 'Nora New',
          email: 'nora.new@example.test',
          givenName: 'Nora',
          hsaId: 'SE5560000001-new1',
          middleName: null,
          surname: 'New',
        },
      })
    })
    vi.stubGlobal('fetch', fetchMock)
    const onSubmit = vi.fn(async () => ({ ok: true as const }))

    render(<HsaPersonChangeModal {...baseProps} onSubmit={onSubmit} />)

    const dialog = screen.getByRole('dialog', { name: 'Change person' })
    const newInput = within(dialog).getByRole('textbox', { name: /New HSA-id/ })
    await waitFor(() => {
      expect(newInput).toBeEnabled()
    })
    fireEvent.change(newInput, { target: { value: 'new1' } })
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
