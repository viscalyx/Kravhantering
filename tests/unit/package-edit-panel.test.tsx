import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import PackageEditPanel from '@/app/[locale]/kravpaket/[slug]/package-edit-panel'

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: (ns?: string) => (key: string) =>
    ns ? `${ns}.${key}` : key,
}))

function okJson(body: unknown) {
  return { ok: true, json: async () => body }
}

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

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
    fetchMock.mockResolvedValue(okJson({ ok: true }))
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

    expect(screen.getByLabelText(/package\.name/)).toHaveValue(
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

    fireEvent.change(screen.getByLabelText(/package\.name/), {
      target: { value: 'Nytt paketnamn' },
    })

    fireEvent.click(screen.getByRole('button', { name: /common\.save/i }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled()
    })

    const [, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(requestInit?.method).toBe('PUT')
    expect(requestInit?.headers).toEqual({ 'Content-Type': 'application/json' })
    expect(JSON.parse((requestInit?.body as string) ?? '{}')).toMatchObject({
      businessNeedsReference: 'Current business need',
      name: 'Nytt paketnamn',
      packageImplementationTypeId: 2,
      packageResponsibilityAreaId: 1,
      uniqueId: 'BEHORIGHET-IAM',
    })
    expect(onSaved).toHaveBeenCalledTimes(1)
  })
})
