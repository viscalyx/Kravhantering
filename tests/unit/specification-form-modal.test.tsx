import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import type { ComponentProps } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import SpecificationFormModal, {
  SPECIFICATION_FORM_ID,
} from '@/app/[locale]/specifications/specification-form-modal'

const confirmMock = vi.fn()

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: (ns?: string) => (key: string) =>
    ns ? `${ns}.${key}` : key,
}))

vi.mock('@/components/ConfirmModal', () => ({
  useConfirmModal: () => ({ confirm: confirmMock }),
}))

function okJson(body: unknown) {
  const text = JSON.stringify(body)
  return { ok: true, json: async () => body, text: async () => text }
}

function errJson(body: unknown, status = 500, statusText = 'Server Error') {
  const text = JSON.stringify(body)
  return {
    json: async () => body,
    ok: false,
    status,
    statusText,
    text: async () => text,
  }
}

const hsaIdPrefixPayload = {
  prefixes: [{ id: 1, isDefault: true, label: null, prefix: 'SE5560000001' }],
}

async function getEnabledChangeResponsibleButton() {
  const button = screen.getByRole('button', {
    name: /specification\.changeResponsible/,
  })
  await waitFor(() => expect(button).not.toBeDisabled())
  return button
}

let fetchMock: ReturnType<typeof vi.fn>

const implementationTypes = [{ id: 2, nameEn: 'Program', nameSv: 'Program' }]
const lifecycleStatuses = [
  { id: 3, nameEn: 'Development', nameSv: 'Utveckling' },
]
const governanceObjectTypes = [
  { id: 1, nameEn: 'Platform', nameSv: 'Plattform' },
]
const currentUser = {
  displayName: 'Ada Admin',
  email: 'ada.admin@example.test',
  hsaId: 'SE5560000001-ada1',
  roles: ['Admin'],
}
const spec = {
  businessNeedsReference: 'Current business need',
  id: 7,
  name: 'Upphandling av e-tjänstplattform',
  permissions: {
    canEditContent: true,
    canManageAssignments: true,
    canReviewDecisions: false,
    canUseAi: true,
  },
  responsibleDisplayName: 'Ada Admin',
  responsibleHsaId: 'SE5560000001-ada1',
  specificationImplementationTypeId: 2,
  specificationLifecycleStatusId: 3,
  specificationGovernanceObjectTypeId: 1,
  uniqueId: 'ETJANST-UPP-2026',
}

function renderEditModal(
  props: Partial<ComponentProps<typeof SpecificationFormModal>> = {},
) {
  return render(
    <SpecificationFormModal
      currentUser={currentUser}
      governanceObjectTypes={governanceObjectTypes}
      implementationTypes={implementationTypes}
      lifecycleStatuses={lifecycleStatuses}
      mode="edit"
      onClose={() => {}}
      onSaved={() => {}}
      open
      spec={spec}
      specificationSlug="ETJANST-UPP-2026"
      {...props}
    />,
  )
}

function createModalElement(
  props: Partial<ComponentProps<typeof SpecificationFormModal>> = {},
) {
  return (
    <SpecificationFormModal
      currentUser={currentUser}
      governanceObjectTypes={governanceObjectTypes}
      implementationTypes={implementationTypes}
      lifecycleStatuses={lifecycleStatuses}
      mode="create"
      onClose={() => {}}
      onSaved={() => {}}
      open
      {...props}
    />
  )
}

function renderCreateModal(
  props: Partial<ComponentProps<typeof SpecificationFormModal>> = {},
) {
  return render(createModalElement(props))
}

describe('SpecificationFormModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    confirmMock.mockReset()
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.mockImplementation((url: string) => {
      if (url === '/api/auth/me') {
        return Promise.resolve(
          okJson({
            authenticated: true,
            hsaId: 'SE5560000001-ada1',
            roles: ['Admin'],
          }),
        )
      }
      if (url === '/api/hsa-id-prefixes') {
        return new Promise(() => undefined)
      }
      if (url.endsWith('/co-authors')) {
        return new Promise(() => undefined)
      }
      return Promise.resolve(okJson({ ok: true }))
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('prefills the specification edit form and exposes developer-mode metadata', () => {
    renderEditModal()

    expect(
      screen.getByRole('dialog', {
        name: /specification\.editSpecification/,
      }),
    ).toHaveAttribute('data-developer-mode-value', 'edit specification')

    expect(
      screen.getByRole('textbox', { name: /specification\.name/ }),
    ).toHaveValue('Upphandling av e-tjänstplattform')
    expect(
      screen.getByRole('textbox', { name: /specification\.responsibleHsaId/ }),
    ).toHaveValue('SE5560000001-ada1')
    expect(
      screen.getByRole('textbox', { name: /specification\.responsibleHsaId/ }),
    ).toHaveAttribute('readonly')
    expect(
      screen.getByRole('combobox', { name: /specification\.lifecycleStatus/ }),
    ).toBeRequired()
    expect(
      screen.getByRole('combobox', { name: /specification\.lifecycleStatus/ }),
    ).toHaveValue('3')
    const requiredFieldsHint = screen.getByText('common.requiredFieldsHint')
    const actionRow = requiredFieldsHint.closest(
      '[data-form-action-row="true"]',
    )
    expect(actionRow).toContainElement(requiredFieldsHint)
    expect(actionRow).toContainElement(
      screen.getByRole('button', { name: /common\.save/i }),
    )
    expect(actionRow).toContainElement(
      screen.getByRole('button', { name: /common\.cancel/i }),
    )
    expect(screen.getByRole('button', { name: /common\.save/i })).toBeDisabled()
    expect(
      screen.getByRole('button', { name: /common\.save/i }),
    ).toHaveAttribute('title', 'common.noChangesToSave')
    expect(screen.getByText('Ada Admin')).toBeInTheDocument()
    expect(
      screen.getByRole('button', {
        name: /specification\.changeResponsible/,
      }),
    ).toBeInTheDocument()

    const form = document.body.querySelector(
      '[data-developer-mode-name="crud form"][data-developer-mode-context="requirements specification detail"]',
    )
    expect(form).toHaveAttribute('data-developer-mode-value', 'edit')
    const fieldGrid = form?.querySelector('.grid')
    expect(fieldGrid).toHaveClass('grid-cols-1')
    expect(fieldGrid).toHaveClass('lg:grid-cols-2')
  })

  it('keeps edit controls disabled when server permissions are missing', () => {
    const { permissions: omittedPermissions, ...specWithoutPermissions } = spec
    void omittedPermissions

    renderEditModal({ spec: specWithoutPermissions })

    expect(
      screen.getByRole('textbox', { name: /specification\.name/ }),
    ).toBeDisabled()
    expect(
      screen.getByRole('button', {
        name: /specification\.changeResponsible/,
      }),
    ).toBeDisabled()
  })

  it('calls onClose when the unchanged modal cancel button is pressed', () => {
    const onClose = vi.fn()

    renderEditModal({ onClose })

    fireEvent.click(screen.getByRole('button', { name: /common\.cancel/i }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('confirms before closing a dirty modal', async () => {
    confirmMock.mockResolvedValueOnce(false).mockResolvedValueOnce(true)
    const onClose = vi.fn()

    renderEditModal({ onClose })

    fireEvent.change(
      screen.getByRole('textbox', { name: /specification\.name/ }),
      { target: { value: 'Osparat namn' } },
    )
    fireEvent.click(screen.getByRole('button', { name: /common\.cancel/i }))

    await waitFor(() => {
      expect(confirmMock).toHaveBeenCalledWith(
        expect.objectContaining({
          icon: 'caution',
          message: 'common.unsavedChangesConfirm',
          variant: 'danger',
        }),
      )
    })
    expect(onClose).not.toHaveBeenCalled()
    expect(
      screen.getByRole('textbox', { name: /specification\.name/ }),
    ).toHaveValue('Osparat namn')

    fireEvent.click(screen.getByRole('button', { name: /common\.cancel/i }))

    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1)
    })
  })

  it.each([
    {
      name: 'close button',
      trigger: () =>
        fireEvent.click(screen.getByRole('button', { name: /common\.close/i })),
    },
    {
      name: 'Escape',
      trigger: () =>
        fireEvent.keyDown(
          screen.getByRole('dialog', {
            name: /specification\.editSpecification/,
          }),
          { key: 'Escape' },
        ),
    },
  ])('confirms before closing a dirty modal via $name', async ({ trigger }) => {
    confirmMock.mockResolvedValue(false)
    const onClose = vi.fn()

    renderEditModal({ onClose })

    fireEvent.change(
      screen.getByRole('textbox', { name: /specification\.name/ }),
      { target: { value: 'Osparat namn' } },
    )

    trigger()

    await waitFor(() => {
      expect(confirmMock).toHaveBeenCalledWith(
        expect.objectContaining({
          icon: 'caution',
          message: 'common.unsavedChangesConfirm',
          variant: 'danger',
        }),
      )
    })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('does not close or confirm dirty form changes on backdrop click', () => {
    const onClose = vi.fn()

    renderEditModal({ onClose })

    fireEvent.change(
      screen.getByRole('textbox', { name: /specification\.name/ }),
      { target: { value: 'Osparat namn' } },
    )
    const backdrop = document.body.querySelector(
      '.absolute.inset-0',
    ) as HTMLElement | null
    expect(backdrop).not.toBeNull()
    fireEvent.click(backdrop as HTMLElement)

    expect(confirmMock).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
    expect(
      screen.getByRole('textbox', { name: /specification\.name/ }),
    ).toHaveValue('Osparat namn')
  })

  it('shows contextual help for specification fields', () => {
    renderEditModal()

    fireEvent.click(
      screen.getByRole('button', { name: 'common.help: specification.name' }),
    )

    expect(screen.getByText('specification.help.name')).toBeInTheDocument()
  })

  it('sends the specification id when verifying a new responsible HSA-id in the modal', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url === '/api/auth/me') {
        return Promise.resolve(
          okJson({
            authenticated: true,
            hsaId: 'SE5560000001-ada1',
            roles: ['Admin'],
          }),
        )
      }
      if (url === '/api/hsa-id-prefixes') {
        return Promise.resolve(okJson(hsaIdPrefixPayload))
      }
      if (url === '/api/requirement-responsibility-people/verify') {
        return Promise.resolve(
          okJson({
            person: {
              displayName: 'Rita Reviewer',
              email: 'rita.reviewer@example.test',
              givenName: 'Rita',
              hsaId: 'SE5560000001-rita1',
              middleName: null,
              surname: 'Reviewer',
            },
          }),
        )
      }
      return Promise.resolve(okJson({ ok: true }))
    })

    renderEditModal()

    fireEvent.click(await getEnabledChangeResponsibleButton())
    const dialog = screen.getByRole('dialog', {
      name: 'specification.changeResponsibleTitle',
    })
    const newResponsibleInput = within(dialog).getByRole('textbox', {
      name: /specification\.newResponsibleHsaId/,
    })
    await waitFor(() => {
      expect(newResponsibleInput).toBeEnabled()
    })
    fireEvent.change(newResponsibleInput, { target: { value: 'rita1' } })
    fireEvent.click(
      within(dialog).getByRole('button', { name: /common\.fetchHsaPerson/ }),
    )

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/requirement-responsibility-people/verify',
        expect.objectContaining({ method: 'POST' }),
      )
    })
    const [url, requestInit] = fetchMock.mock.calls.find(
      ([calledUrl]) =>
        calledUrl === '/api/requirement-responsibility-people/verify',
    ) as [string, RequestInit]
    expect(url).toBe('/api/requirement-responsibility-people/verify')
    expect(JSON.parse((requestInit.body as string) ?? '{}')).toMatchObject({
      hsaId: 'SE5560000001-rita1',
      mode: 'refresh',
      purpose: 'requirements_specification_responsible',
      scopeId: 7,
    })
  })

  it('does not verify from the locked main responsible HSA-id field', async () => {
    renderEditModal()

    fireEvent.blur(
      screen.getByRole('textbox', { name: /specification\.responsibleHsaId/ }),
    )

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([calledUrl]) =>
            calledUrl === '/api/requirement-responsibility-people/verify',
        ),
      ).toBe(false)
    })
  })

  it('keeps responsible changes disabled when the current user is unavailable', () => {
    renderEditModal({
      currentUser: null,
      currentUserLoading: false,
      currentUserUnavailable: true,
    })

    expect(
      screen.getByRole('button', {
        name: /specification\.changeResponsible/,
      }),
    ).toBeDisabled()
  })

  it('blocks create saves when the current user HSA-id is unavailable', () => {
    renderCreateModal({
      currentUser: null,
      currentUserLoading: false,
      currentUserUnavailable: true,
    })

    expect(
      screen.getByText('specification.currentUserUnavailable'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /common\.save/i })).toBeDisabled()

    fireEvent.submit(document.getElementById(SPECIFICATION_FORM_ID) as Element)

    expect(
      fetchMock.mock.calls.some(
        ([url, init]) =>
          url === '/api/requirements-specifications' &&
          (init as RequestInit | undefined)?.method === 'POST',
      ),
    ).toBe(false)
  })

  it('blocks create saves when lifecycle status is empty', () => {
    renderCreateModal()

    expect(
      screen.getByRole('combobox', { name: /specification\.lifecycleStatus/ }),
    ).toBeRequired()
    fireEvent.change(
      screen.getByRole('textbox', { name: /specification\.name/ }),
      { target: { value: 'Specification without lifecycle status' } },
    )
    fireEvent.change(
      screen.getByRole('textbox', { name: /specification\.uniqueId/ }),
      { target: { value: 'SPEC-WITHOUT-LIFECYCLE' } },
    )

    fireEvent.submit(document.getElementById(SPECIFICATION_FORM_ID) as Element)

    expect(
      screen.getByText('specification.lifecycleStatusRequired'),
    ).toBeInTheDocument()
    expect(
      fetchMock.mock.calls.some(
        ([url, init]) =>
          url === '/api/requirements-specifications' &&
          (init as RequestInit | undefined)?.method === 'POST',
      ),
    ).toBe(false)
  })

  it('fills the create responsible fields when the current user becomes available', async () => {
    const view = renderCreateModal({
      currentUser: null,
      currentUserLoading: true,
      currentUserUnavailable: false,
    })

    expect(screen.getByRole('button', { name: /common\.save/i })).toBeDisabled()
    expect(
      screen.getByRole('textbox', { name: /specification\.responsibleHsaId/ }),
    ).toHaveValue('')

    fireEvent.change(
      screen.getByRole('textbox', { name: /specification\.name/ }),
      { target: { value: 'Påbörjat kravunderlag' } },
    )

    view.rerender(createModalElement({ currentUser }))

    await waitFor(() => {
      expect(
        screen.getByRole('textbox', {
          name: /specification\.responsibleHsaId/,
        }),
      ).toHaveValue(currentUser.hsaId)
    })
    expect(
      screen.getByRole('textbox', { name: /specification\.name/ }),
    ).toHaveValue('Påbörjat kravunderlag')
    expect(
      screen.getByRole('button', { name: /common\.save/i }),
    ).not.toBeDisabled()
    expect(
      screen.getByText(new RegExp(currentUser.displayName)),
    ).toBeInTheDocument()
  })

  it('changes responsible through the modal using a dedicated payload', async () => {
    const onResponsibleChanged = vi.fn()
    const onClose = vi.fn()
    fetchMock.mockImplementation((url: string, opts?: RequestInit) => {
      if (url === '/api/auth/me') {
        return Promise.resolve(
          okJson({
            authenticated: true,
            hsaId: 'SE5560000001-ada1',
            roles: ['Admin'],
          }),
        )
      }
      if (url === '/api/hsa-id-prefixes') {
        return Promise.resolve(okJson(hsaIdPrefixPayload))
      }
      if (opts?.method === 'PUT') {
        return Promise.resolve(
          okJson({
            ...spec,
            responsibleDisplayName: 'Rita Reviewer',
            responsibleHsaId: 'SE5560000001-rita1',
          }),
        )
      }
      return Promise.resolve(okJson({ ok: true }))
    })
    renderEditModal({
      onClose,
      onResponsibleChanged,
    })

    fireEvent.click(await getEnabledChangeResponsibleButton())
    const dialog = screen.getByRole('dialog', {
      name: 'specification.changeResponsibleTitle',
    })
    const newResponsibleInput = within(dialog).getByRole('textbox', {
      name: /specification\.newResponsibleHsaId/,
    })
    await waitFor(() => {
      expect(newResponsibleInput).toBeEnabled()
    })
    fireEvent.change(newResponsibleInput, { target: { value: 'rita1' } })
    fireEvent.click(
      within(dialog).getByRole('button', {
        name: /specification\.changeResponsible/,
      }),
    )

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/requirements-specifications/ETJANST-UPP-2026/responsible',
        expect.objectContaining({ method: 'PUT' }),
      )
    })

    const [, requestInit] = fetchMock.mock.calls.find(
      ([url, init]) =>
        url ===
          '/api/requirements-specifications/ETJANST-UPP-2026/responsible' &&
        (init as RequestInit | undefined)?.method === 'PUT',
    ) as [string, RequestInit]
    const body = JSON.parse((requestInit.body as string) ?? '{}')
    expect(body).toEqual({ responsibleHsaId: 'SE5560000001-rita1' })
    expect(onResponsibleChanged).toHaveBeenCalledWith(
      expect.objectContaining({
        responsibleDisplayName: 'Rita Reviewer',
        responsibleHsaId: 'SE5560000001-rita1',
      }),
    )
    expect(onClose).not.toHaveBeenCalled()
    expect(
      screen.getByRole('textbox', { name: /specification\.responsibleHsaId/ }),
    ).toHaveValue('SE5560000001-rita1')
  })

  it('keeps the responsible modal open and shows an error when responsible handover fails', async () => {
    const onResponsibleChanged = vi.fn()
    const onClose = vi.fn()
    fetchMock.mockImplementation((url: string, opts?: RequestInit) => {
      if (url === '/api/auth/me') {
        return Promise.resolve(
          okJson({
            authenticated: true,
            hsaId: 'SE5560000001-ada1',
            roles: ['Admin'],
          }),
        )
      }
      if (url === '/api/hsa-id-prefixes') {
        return Promise.resolve(okJson(hsaIdPrefixPayload))
      }
      if (
        url ===
          '/api/requirements-specifications/ETJANST-UPP-2026/responsible' &&
        opts?.method === 'PUT'
      ) {
        return Promise.resolve(
          errJson({ error: 'Responsible handover failed' }, 409, 'Conflict'),
        )
      }
      return Promise.resolve(okJson({ ok: true }))
    })
    renderEditModal({
      onClose,
      onResponsibleChanged,
    })

    fireEvent.click(await getEnabledChangeResponsibleButton())
    const dialog = screen.getByRole('dialog', {
      name: 'specification.changeResponsibleTitle',
    })
    const newResponsibleInput = within(dialog).getByRole('textbox', {
      name: /specification\.newResponsibleHsaId/,
    })
    await waitFor(() => {
      expect(newResponsibleInput).toBeEnabled()
    })
    fireEvent.change(newResponsibleInput, { target: { value: 'rita1' } })
    fireEvent.click(
      within(dialog).getByRole('button', {
        name: /specification\.changeResponsible/,
      }),
    )

    await waitFor(() => {
      expect(within(dialog).getByRole('alert')).toHaveTextContent(
        'Responsible handover failed',
      )
    })
    expect(dialog).toBeInTheDocument()
    expect(
      screen.getByRole('textbox', { name: /specification\.responsibleHsaId/ }),
    ).toHaveValue('SE5560000001-ada1')
    expect(onResponsibleChanged).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('submits the updated specification information', async () => {
    const onSaved = vi.fn((_result: { newUniqueId: string }) => {})

    renderEditModal({ onSaved })

    fireEvent.change(
      screen.getByRole('textbox', { name: /specification\.name/ }),
      {
        target: { value: 'Nytt kravunderlagsnamn' },
      },
    )

    fireEvent.click(screen.getByRole('button', { name: /common\.save/i }))

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
    expect(onSaved).toHaveBeenCalledWith(
      expect.objectContaining({ newUniqueId: expect.any(String) }),
    )

    const [url, requestInit] = fetchMock.mock.calls.find(
      ([calledUrl, init]) =>
        calledUrl === '/api/requirements-specifications/ETJANST-UPP-2026' &&
        (init as RequestInit | undefined)?.method === 'PUT',
    ) as [string, RequestInit]
    expect(url).toBe('/api/requirements-specifications/ETJANST-UPP-2026')
    expect(requestInit?.method).toBe('PUT')
    expect(
      Object.fromEntries(new Headers(requestInit?.headers).entries()),
    ).toEqual({
      'content-type': 'application/json',
      'x-requested-with': 'XMLHttpRequest',
    })
    expect(JSON.parse((requestInit?.body as string) ?? '{}')).toMatchObject({
      businessNeedsReference: 'Current business need',
      name: 'Nytt kravunderlagsnamn',
      specificationImplementationTypeId: 2,
      specificationLifecycleStatusId: 3,
      specificationGovernanceObjectTypeId: 1,
      uniqueId: 'ETJANST-UPP-2026',
    })
    expect(
      JSON.parse((requestInit?.body as string) ?? '{}'),
    ).not.toHaveProperty('responsibleHsaId')
  })

  it('confirms unsaved edits and closes after non-admin responsible changes', async () => {
    confirmMock.mockResolvedValue(true)
    const onClose = vi.fn()
    fetchMock.mockImplementation((url: string, opts?: RequestInit) => {
      if (url === '/api/auth/me') {
        return Promise.resolve(
          okJson({
            authenticated: true,
            hsaId: 'SE5560000001-ada1',
            roles: ['RequirementsEditor'],
          }),
        )
      }
      if (url === '/api/hsa-id-prefixes') {
        return Promise.resolve(okJson(hsaIdPrefixPayload))
      }
      if (opts?.method === 'PUT') {
        return Promise.resolve(
          okJson({
            ...spec,
            responsibleDisplayName: 'Rita Reviewer',
            responsibleHsaId: 'SE5560000001-rita1',
          }),
        )
      }
      return Promise.resolve(okJson({ ok: true }))
    })

    renderEditModal({
      currentUser: {
        displayName: 'Ada Admin',
        email: 'ada.admin@example.test',
        hsaId: 'SE5560000001-ada1',
        roles: ['RequirementsEditor'],
      },
      onClose,
    })

    fireEvent.change(
      screen.getByRole('textbox', { name: /specification\.name/ }),
      { target: { value: 'Osparat namn' } },
    )
    fireEvent.click(await getEnabledChangeResponsibleButton())

    const dialog = screen.getByRole('dialog', {
      name: 'specification.changeResponsibleTitle',
    })
    const newResponsibleInput = within(dialog).getByRole('textbox', {
      name: /specification\.newResponsibleHsaId/,
    })
    await waitFor(() => {
      expect(newResponsibleInput).toBeEnabled()
    })
    fireEvent.change(newResponsibleInput, { target: { value: 'rita1' } })
    fireEvent.click(
      within(dialog).getByRole('button', {
        name: /specification\.changeResponsible/,
      }),
    )

    await waitFor(() => {
      expect(confirmMock).toHaveBeenCalledWith(
        expect.objectContaining({
          defaultCancel: true,
          message: 'specification.responsibleChangeUnsavedConfirm',
        }),
      )
      expect(onClose).toHaveBeenCalledTimes(1)
    })
  })

  it('ignores repeated submits while a save is already in progress', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url === '/api/auth/me') {
        return Promise.resolve(
          okJson({
            authenticated: true,
            hsaId: 'SE5560000001-ada1',
            roles: ['Admin'],
          }),
        )
      }
      return new Promise(() => undefined)
    })

    renderEditModal()

    const form = screen
      .getByRole('button', { name: /common\.save/i })
      .closest('form')

    expect(form).toBeTruthy()

    fireEvent.change(
      screen.getByRole('textbox', { name: /specification\.name/ }),
      {
        target: { value: 'Nytt kravunderlagsnamn' },
      },
    )
    fireEvent.submit(form as HTMLFormElement)
    fireEvent.submit(form as HTMLFormElement)

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /common\.cancel/i }),
      ).toBeDisabled()
      expect(
        screen.getByRole('button', { name: /common\.close/i }),
      ).toBeDisabled()
    })

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.filter(
          ([url, init]) =>
            url === '/api/requirements-specifications/ETJANST-UPP-2026' &&
            (init as RequestInit | undefined)?.method === 'PUT',
        ),
      ).toHaveLength(1)
    })
  })
})
