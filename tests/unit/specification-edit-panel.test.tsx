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
const responsibilityAreas = [{ id: 1, nameEn: 'Platform', nameSv: 'Plattform' }]
const pkg = {
  businessNeedsReference: 'Current business need',
  name: 'Upphandling av e-tjänstplattform',
  specificationImplementationTypeId: 2,
  specificationLifecycleStatusId: 3,
  specificationResponsibilityAreaId: 1,
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

  it('prefills the package edit form and exposes developer-mode metadata', () => {
    const { container } = render(
      <SpecificationEditPanel
        implementationTypes={implementationTypes}
        lifecycleStatuses={lifecycleStatuses}
        onCancel={() => {}}
        onSaved={() => {}}
        pkg={pkg}
        responsibilityAreas={responsibilityAreas}
        specificationSlug="ETJANST-UPP-2026"
      />,
    )

    expect(
      screen.getByRole('textbox', { name: /specification\.name/ }),
    ).toHaveValue('Upphandling av e-tjänstplattform')

    const form = container.querySelector(
      '[data-developer-mode-name="crud form"][data-developer-mode-context="requirements specification detail"]',
    )
    expect(form).toHaveAttribute('data-developer-mode-value', 'edit')
  })

  it('calls onCancel when the cancel button is pressed', () => {
    const onCancel = vi.fn()

    render(
      <SpecificationEditPanel
        implementationTypes={implementationTypes}
        lifecycleStatuses={lifecycleStatuses}
        onCancel={onCancel}
        onSaved={() => {}}
        pkg={pkg}
        responsibilityAreas={responsibilityAreas}
        specificationSlug="ETJANST-UPP-2026"
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /common\.cancel/i }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('shows contextual help for package fields', () => {
    render(
      <SpecificationEditPanel
        implementationTypes={implementationTypes}
        lifecycleStatuses={lifecycleStatuses}
        onCancel={() => {}}
        onSaved={() => {}}
        pkg={pkg}
        responsibilityAreas={responsibilityAreas}
        specificationSlug="ETJANST-UPP-2026"
      />,
    )

    fireEvent.click(
      screen.getByRole('button', { name: 'common.help: specification.name' }),
    )

    expect(screen.getByText('specification.help.name')).toBeInTheDocument()
  })

  it('submits the updated package information', async () => {
    const onSaved = vi.fn((_result: { newUniqueId: string }) => {})

    render(
      <SpecificationEditPanel
        implementationTypes={implementationTypes}
        lifecycleStatuses={lifecycleStatuses}
        onCancel={() => {}}
        onSaved={onSaved}
        pkg={pkg}
        responsibilityAreas={responsibilityAreas}
        specificationSlug="ETJANST-UPP-2026"
      />,
    )

    fireEvent.change(
      screen.getByRole('textbox', { name: /specification\.name/ }),
      {
        target: { value: 'Nytt paketnamn' },
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
      name: 'Nytt paketnamn',
      specificationImplementationTypeId: 2,
      specificationLifecycleStatusId: 3,
      specificationResponsibilityAreaId: 1,
      uniqueId: 'ETJANST-UPP-2026',
    })
  })

  it('ignores repeated submits while a save is already in progress', async () => {
    fetchMock.mockReturnValue(new Promise(() => undefined))

    render(
      <SpecificationEditPanel
        implementationTypes={implementationTypes}
        lifecycleStatuses={lifecycleStatuses}
        onCancel={() => {}}
        onSaved={() => {}}
        pkg={pkg}
        responsibilityAreas={responsibilityAreas}
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
