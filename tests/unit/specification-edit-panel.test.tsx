import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import SpecificationEditPanel from '@/app/[locale]/specifications/[slug]/specification-edit-panel'

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: (ns?: string) => (key: string) =>
    ns ? `${ns}.${key}` : key,
}))

function okJson(body: unknown) {
  const text = JSON.stringify(body)
  return { ok: true, json: async () => body, text: async () => text }
}

let fetchMock: ReturnType<typeof vi.fn>

const implementationTypes = [{ id: 2, nameEn: 'Program', nameSv: 'Program' }]
const lifecycleStatuses = [
  { id: 3, nameEn: 'Development', nameSv: 'Utveckling' },
]
const governanceObjectTypes = [
  { id: 1, nameEn: 'Platform', nameSv: 'Plattform' },
]
const spec = {
  businessNeedsReference: 'Current business need',
  canResponsibleGenerateAi: true,
  id: 7,
  name: 'Upphandling av e-tjänstplattform',
  responsibleDisplayName: 'Ada Admin',
  responsibleHsaId: 'SE5560000001-ada1',
  specificationImplementationTypeId: 2,
  specificationLifecycleStatusId: 3,
  specificationGovernanceObjectTypeId: 1,
  uniqueId: 'ETJANST-UPP-2026',
}

describe('SpecificationEditPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.mockResolvedValue(okJson({ ok: true }))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('prefills the specification edit form and exposes developer-mode metadata', () => {
    const { container } = render(
      <SpecificationEditPanel
        governanceObjectTypes={governanceObjectTypes}
        implementationTypes={implementationTypes}
        lifecycleStatuses={lifecycleStatuses}
        onCancel={() => {}}
        onSaved={() => {}}
        spec={spec}
        specificationSlug="ETJANST-UPP-2026"
      />,
    )

    expect(
      screen.getByRole('textbox', { name: /specification\.name/ }),
    ).toHaveValue('Upphandling av e-tjänstplattform')
    expect(
      screen.getByRole('textbox', {
        name: /common\.hsaVerifyName/,
      }),
    ).toHaveValue('Ada Admin')
    expect(
      screen.getByRole('textbox', { name: /specification\.responsibleHsaId/ }),
    ).toHaveValue('SE5560000001-ada1')
    expect(
      screen.getByRole('checkbox', {
        name: /specification\.canResponsibleGenerateAi/,
      }),
    ).toBeChecked()

    const form = container.querySelector(
      '[data-developer-mode-name="crud form"][data-developer-mode-context="requirements specification detail"]',
    )
    expect(form).toHaveAttribute('data-developer-mode-value', 'edit')
  })

  it('calls onCancel when the cancel button is pressed', () => {
    const onCancel = vi.fn()

    render(
      <SpecificationEditPanel
        governanceObjectTypes={governanceObjectTypes}
        implementationTypes={implementationTypes}
        lifecycleStatuses={lifecycleStatuses}
        onCancel={onCancel}
        onSaved={() => {}}
        spec={spec}
        specificationSlug="ETJANST-UPP-2026"
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /common\.cancel/i }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('shows contextual help for specification fields', () => {
    render(
      <SpecificationEditPanel
        governanceObjectTypes={governanceObjectTypes}
        implementationTypes={implementationTypes}
        lifecycleStatuses={lifecycleStatuses}
        onCancel={() => {}}
        onSaved={() => {}}
        spec={spec}
        specificationSlug="ETJANST-UPP-2026"
      />,
    )

    fireEvent.click(
      screen.getByRole('button', { name: 'common.help: specification.name' }),
    )

    expect(screen.getByText('specification.help.name')).toBeInTheDocument()
  })

  it('sends the specification id when verifying the responsible HSA-ID', async () => {
    fetchMock.mockResolvedValueOnce(
      okJson({
        person: {
          displayName: 'Ada Admin',
          email: 'ada.admin@example.test',
          givenName: 'Ada',
          hsaId: 'SE5560000001-ada1',
          middleName: null,
          surname: 'Admin',
        },
      }),
    )

    render(
      <SpecificationEditPanel
        governanceObjectTypes={governanceObjectTypes}
        implementationTypes={implementationTypes}
        lifecycleStatuses={lifecycleStatuses}
        onCancel={() => {}}
        onSaved={() => {}}
        spec={spec}
        specificationSlug="ETJANST-UPP-2026"
      />,
    )

    fireEvent.click(
      screen.getByRole('button', { name: /common\.fetchHsaPerson/ }),
    )

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const [url, requestInit] = fetchMock.mock.calls.at(0) as [
      string,
      RequestInit,
    ]
    expect(url).toBe('/api/requirement-responsibility-people/verify')
    expect(JSON.parse((requestInit.body as string) ?? '{}')).toMatchObject({
      hsaId: 'SE5560000001-ada1',
      mode: 'refresh',
      purpose: 'requirements_specification_responsible',
      scopeId: 7,
    })
  })

  it('uses local-first verification when leaving the responsible HSA-ID field', async () => {
    fetchMock.mockResolvedValueOnce(
      okJson({
        person: {
          displayName: 'Ada Admin',
          email: 'ada.admin@example.test',
          givenName: 'Ada',
          hsaId: 'SE5560000001-ada1',
          middleName: null,
          surname: 'Admin',
        },
      }),
    )

    render(
      <SpecificationEditPanel
        governanceObjectTypes={governanceObjectTypes}
        implementationTypes={implementationTypes}
        lifecycleStatuses={lifecycleStatuses}
        onCancel={() => {}}
        onSaved={() => {}}
        spec={spec}
        specificationSlug="ETJANST-UPP-2026"
      />,
    )

    fireEvent.blur(
      screen.getByRole('textbox', { name: /specification\.responsibleHsaId/ }),
    )

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const [url, requestInit] = fetchMock.mock.calls.at(0) as [
      string,
      RequestInit,
    ]
    expect(url).toBe('/api/requirement-responsibility-people/verify')
    expect(JSON.parse((requestInit.body as string) ?? '{}')).toMatchObject({
      hsaId: 'SE5560000001-ada1',
      mode: 'reuse_local',
      purpose: 'requirements_specification_responsible',
      scopeId: 7,
    })
  })

  it('does not send person details when saving after verification', async () => {
    const verifiedPerson = {
      displayName: 'Ada Admin',
      email: 'ada.admin@example.test',
      givenName: 'Ada',
      hsaId: 'SE5560000001-ada1',
      middleName: null,
      surname: 'Admin',
    }
    fetchMock.mockResolvedValueOnce(okJson({ person: verifiedPerson }))
    fetchMock.mockResolvedValueOnce(okJson({ ok: true }))

    render(
      <SpecificationEditPanel
        governanceObjectTypes={governanceObjectTypes}
        implementationTypes={implementationTypes}
        lifecycleStatuses={lifecycleStatuses}
        onCancel={() => {}}
        onSaved={() => {}}
        spec={spec}
        specificationSlug="ETJANST-UPP-2026"
      />,
    )

    fireEvent.click(
      screen.getByRole('button', { name: /common\.fetchHsaPerson/ }),
    )
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    await waitFor(() =>
      expect(
        screen.getByRole('textbox', { name: /common\.hsaVerifyEmail/ }),
      ).toHaveValue('ada.admin@example.test'),
    )

    fireEvent.click(screen.getByRole('button', { name: /common\.save/i }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))

    const [, requestInit] = fetchMock.mock.calls.at(-1) as [string, RequestInit]
    const body = JSON.parse((requestInit.body as string) ?? '{}')
    expect(body).toMatchObject({
      responsibleHsaId: 'SE5560000001-ada1',
    })
    expect(body).not.toHaveProperty('responsiblePersonPreview')
  })

  it('submits the updated specification information', async () => {
    const onSaved = vi.fn((_result: { newUniqueId: string }) => {})

    render(
      <SpecificationEditPanel
        governanceObjectTypes={governanceObjectTypes}
        implementationTypes={implementationTypes}
        lifecycleStatuses={lifecycleStatuses}
        onCancel={() => {}}
        onSaved={onSaved}
        spec={spec}
        specificationSlug="ETJANST-UPP-2026"
      />,
    )

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

    const [url, requestInit] = fetchMock.mock.calls.at(-1) as [
      string,
      RequestInit,
    ]
    expect(url).toBe('/api/specifications/ETJANST-UPP-2026')
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
      responsibleHsaId: 'SE5560000001-ada1',
      canResponsibleGenerateAi: true,
      specificationImplementationTypeId: 2,
      specificationLifecycleStatusId: 3,
      specificationGovernanceObjectTypeId: 1,
      uniqueId: 'ETJANST-UPP-2026',
    })
  })

  it('ignores repeated submits while a save is already in progress', async () => {
    fetchMock.mockReturnValue(new Promise(() => undefined))

    render(
      <SpecificationEditPanel
        governanceObjectTypes={governanceObjectTypes}
        implementationTypes={implementationTypes}
        lifecycleStatuses={lifecycleStatuses}
        onCancel={() => {}}
        onSaved={() => {}}
        spec={spec}
        specificationSlug="ETJANST-UPP-2026"
      />,
    )

    const form = screen
      .getByRole('button', { name: /common\.save/i })
      .closest('form')

    expect(form).toBeTruthy()

    fireEvent.submit(form as HTMLFormElement)
    fireEvent.submit(form as HTMLFormElement)

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
  })
})
