import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import PackageEditPanel from '@/app/[locale]/requirement-packages/[slug]/package-edit-panel'

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: (ns?: string) => (key: string) =>
    ns ? `${ns}.${key}` : key,
}))

function okJson(body: unknown) {
  return { ok: true, json: async () => body }
}

let fetchMock: ReturnType<typeof vi.fn>

const implementationTypes = [{ id: 2, nameEn: 'Program', nameSv: 'Program' }]
const responsibilityAreas = [{ id: 1, nameEn: 'Platform', nameSv: 'Plattform' }]
const pkg = {
  businessNeedsReference: 'Current business need',
  name: 'Behörighet och IAM',
  packageImplementationTypeId: 2,
  packageResponsibilityAreaId: 1,
  uniqueId: 'BEHORIGHET-IAM',
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
        onCancel={() => {}}
        onSaved={() => {}}
        packageSlug="BEHORIGHET-IAM"
        pkg={pkg}
        responsibilityAreas={responsibilityAreas}
      />,
    )

    expect(screen.getByRole('textbox', { name: /package\.name/ })).toHaveValue(
      'Behörighet och IAM',
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
        onCancel={onCancel}
        onSaved={() => {}}
        packageSlug="BEHORIGHET-IAM"
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
        onCancel={() => {}}
        onSaved={() => {}}
        packageSlug="BEHORIGHET-IAM"
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
    const onSaved = vi.fn((_uid: string) => {})

    render(
      <PackageEditPanel
        implementationTypes={implementationTypes}
        onCancel={() => {}}
        onSaved={onSaved}
        packageSlug="BEHORIGHET-IAM"
        pkg={pkg}
        responsibilityAreas={responsibilityAreas}
      />,
    )

    fireEvent.change(screen.getByRole('textbox', { name: /package\.name/ }), {
      target: { value: 'Nytt paketnamn' },
    })

    fireEvent.click(screen.getByRole('button', { name: /common\.save/i }))

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))

    const [url, requestInit] = fetchMock.mock.calls.at(-1) as [
      string,
      RequestInit,
    ]
    expect(url).toBe('/api/requirement-packages/BEHORIGHET-IAM')
    expect(requestInit?.method).toBe('PUT')
    expect(requestInit?.headers).toEqual({ 'Content-Type': 'application/json' })
    expect(JSON.parse((requestInit?.body as string) ?? '{}')).toMatchObject({
      businessNeedsReference: 'Current business need',
      name: 'Nytt paketnamn',
      packageImplementationTypeId: 2,
      packageResponsibilityAreaId: 1,
      uniqueId: 'BEHORIGHET-IAM',
    })
  })
})
