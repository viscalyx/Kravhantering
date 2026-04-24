import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import PackageEditPanel from '@/app/[locale]/requirement-packages/[slug]/package-edit-panel'

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
  name: 'Införande av e-tjänstplattform',
  packageImplementationTypeId: 2,
  packageLifecycleStatusId: 3,
  packageResponsibilityAreaId: 1,
  uniqueId: 'ETJANSTPLATT',
}

describe('PackageEditPanel', () => {
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
      <PackageEditPanel
        implementationTypes={implementationTypes}
        lifecycleStatuses={lifecycleStatuses}
        onCancel={() => {}}
        onSaved={() => {}}
        packageSlug="ETJANSTPLATT"
        pkg={pkg}
        responsibilityAreas={responsibilityAreas}
      />,
    )

    expect(screen.getByRole('textbox', { name: /package\.name/ })).toHaveValue(
      'Införande av e-tjänstplattform',
    )

    const form = container.querySelector(
      '[data-developer-mode-name="crud form"][data-developer-mode-context="requirement package detail"]',
    )
    expect(form).toHaveAttribute('data-developer-mode-value', 'edit')
  })

  it('calls onCancel when the cancel button is pressed', () => {
    const onCancel = vi.fn()

    render(
      <PackageEditPanel
        implementationTypes={implementationTypes}
        lifecycleStatuses={lifecycleStatuses}
        onCancel={onCancel}
        onSaved={() => {}}
        packageSlug="ETJANSTPLATT"
        pkg={pkg}
        responsibilityAreas={responsibilityAreas}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /common\.cancel/i }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('shows contextual help for package fields', () => {
    render(
      <PackageEditPanel
        implementationTypes={implementationTypes}
        lifecycleStatuses={lifecycleStatuses}
        onCancel={() => {}}
        onSaved={() => {}}
        packageSlug="ETJANSTPLATT"
        pkg={pkg}
        responsibilityAreas={responsibilityAreas}
      />,
    )

    fireEvent.click(
      screen.getByRole('button', { name: 'common.help: package.name' }),
    )

    expect(screen.getByText('package.nameHelp')).toBeInTheDocument()
  })

  it('submits the updated package information', async () => {
    const onSaved = vi.fn((_result: { newUniqueId: string }) => {})

    render(
      <PackageEditPanel
        implementationTypes={implementationTypes}
        lifecycleStatuses={lifecycleStatuses}
        onCancel={() => {}}
        onSaved={onSaved}
        packageSlug="ETJANSTPLATT"
        pkg={pkg}
        responsibilityAreas={responsibilityAreas}
      />,
    )

    fireEvent.change(screen.getByRole('textbox', { name: /package\.name/ }), {
      target: { value: 'Nytt paketnamn' },
    })

    fireEvent.click(screen.getByRole('button', { name: /common\.save/i }))

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
    expect(onSaved).toHaveBeenCalledWith(
      expect.objectContaining({ newUniqueId: expect.any(String) }),
    )

    const [url, requestInit] = fetchMock.mock.calls.at(-1) as [
      string,
      RequestInit,
    ]
    expect(url).toBe('/api/requirement-packages/ETJANSTPLATT')
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
      packageImplementationTypeId: 2,
      packageLifecycleStatusId: 3,
      packageResponsibilityAreaId: 1,
      uniqueId: 'ETJANSTPLATT',
    })
  })
})
