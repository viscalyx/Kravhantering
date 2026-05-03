import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import PrintListReportPage from '@/app/[locale]/specifications/[slug]/reports/print/list/page'

let currentRefs: string | null = null
let currentLocale = 'en'
let currentSlug: string | null = 'ETJANST-UPP-2026'

const fetchSpecificationItemsForReportMock = vi.fn()
const buildListReportMock = vi.fn()
const specificationFetchMock = vi.fn()

function createDeferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(resolver => {
    resolve = resolver
  })

  return { promise, resolve }
}

vi.mock('next/navigation', () => ({
  useParams: () => ({ slug: currentSlug }),
  useSearchParams: () => ({
    get: (key: string) => (key === 'refs' ? currentRefs : null),
  }),
}))

vi.mock('next-intl', () => ({
  useLocale: () => currentLocale,
  useTranslations:
    (namespace?: string) =>
    (key: string, values?: Record<string, string | number>) => {
      if (namespace === 'reports' && key === 'specificationFetchFailed') {
        return `Specification fetch failed (${values?.status})`
      }
      if (
        namespace === 'reports' &&
        key === 'specificationFetchFailedWithDetails'
      ) {
        return `Specification fetch failed (${values?.status}): ${values?.details}`
      }
      return namespace ? `${namespace}.${key}` : key
    },
}))

vi.mock('@/components/reports/print/PrintReportRenderer', () => ({
  default: ({ model }: { model: unknown }) => (
    <section aria-label="Print renderer">{JSON.stringify(model)}</section>
  ),
}))

vi.mock('@/lib/reports/data/fetch-specification-items', () => ({
  fetchSpecificationItemsForReport: (...args: unknown[]) =>
    fetchSpecificationItemsForReportMock(...args),
}))

vi.mock('@/lib/reports/templates/list-template', () => ({
  buildListReport: (...args: unknown[]) => buildListReportMock(...args),
}))

describe('requirements specification report pages', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('print', vi.fn())
    vi.stubGlobal('fetch', specificationFetchMock)
    currentRefs = null
    currentLocale = 'en'
    currentSlug = 'ETJANST-UPP-2026'
    buildListReportMock.mockReturnValue({ title: 'Report' })
    specificationFetchMock.mockResolvedValue({
      json: async () => ({
        businessNeedsReference: 'Shared IAM business case',
        implementationType: { nameEn: 'Program', nameSv: 'Program' },
        lifecycleStatus: { nameEn: 'Development', nameSv: 'Utveckling' },
        name: 'Authorization and IAM',
        responsibilityArea: { nameEn: 'Platform', nameSv: 'Plattform' },
        uniqueId: 'ETJANST-UPP-2026',
      }),
      ok: true,
      status: 200,
      text: async () => '',
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('marks the print loading state while the report is being fetched', () => {
    currentRefs = 'lib:1'
    fetchSpecificationItemsForReportMock.mockReturnValue(new Promise(() => {}))

    const { container } = render(<PrintListReportPage />)

    expect(
      container.querySelector(
        '[data-developer-mode-name="report state"][data-developer-mode-value="report-print:loading"]',
      ),
    ).toBeInTheDocument()
  })

  it('clears previous print errors, trims ids, and marks the renderer state', async () => {
    fetchSpecificationItemsForReportMock.mockResolvedValue([
      { id: 1 },
      { id: 2 },
    ])

    const { container, rerender } = render(<PrintListReportPage />)

    await screen.findByText('reports.errorTitle')
    expect(
      container.querySelector(
        '[data-developer-mode-name="report state"][data-developer-mode-value="report-print:error"]',
      ),
    ).toBeInTheDocument()

    currentRefs = ' lib:1 , local:2 '
    rerender(<PrintListReportPage />)

    await waitFor(() => {
      expect(fetchSpecificationItemsForReportMock).toHaveBeenCalledWith(
        'ETJANST-UPP-2026',
        ['lib:1', 'local:2'],
        'en',
      )
    })
    await waitFor(() => {
      expect(
        container.querySelector(
          '[data-developer-mode-name="report state"][data-developer-mode-value="report-print:renderer"]',
        ),
      ).toBeInTheDocument()
    })

    expect(screen.queryByText('reports.errorTitle')).not.toBeInTheDocument()
    expect(
      screen.getByRole('region', { name: /print renderer/i }),
    ).toBeInTheDocument()
  })

  it('ignores stale print responses when a newer request finishes first', async () => {
    const firstRequest = createDeferred<{ id: number }[]>()
    const secondRequest = createDeferred<{ id: number }[]>()

    fetchSpecificationItemsForReportMock
      .mockImplementationOnce(() => firstRequest.promise)
      .mockImplementationOnce(() => secondRequest.promise)
    buildListReportMock.mockImplementation(
      (requirements: { id: number }[]) => ({
        title: `Report ${requirements[0]?.id}`,
      }),
    )

    currentRefs = 'lib:1'
    const { rerender } = render(<PrintListReportPage />)

    currentRefs = 'local:2'
    rerender(<PrintListReportPage />)

    secondRequest.resolve([{ id: 2 }])
    await waitFor(() => {
      expect(
        screen.getByRole('region', { name: /print renderer/i }),
      ).toHaveTextContent('Report 2')
    })

    firstRequest.resolve([{ id: 1 }])
    await waitFor(() => {
      expect(
        screen.getByRole('region', { name: /print renderer/i }),
      ).toHaveTextContent('Report 2')
    })
    expect(
      screen.getByRole('region', { name: /print renderer/i }),
    ).not.toHaveTextContent('Report 1')
  })

  it('extracts readable specification error details from JSON responses', async () => {
    currentRefs = 'lib:1'
    currentSlug = 'spec/with slash'
    fetchSpecificationItemsForReportMock.mockResolvedValue([{ id: 1 }])
    const failingFetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => JSON.stringify({ error: 'Specification missing' }),
    })
    vi.stubGlobal('fetch', failingFetchMock)

    render(<PrintListReportPage />)

    expect(await screen.findByText('reports.errorTitle')).toBeInTheDocument()
    expect(failingFetchMock).toHaveBeenCalledWith(
      '/api/specifications/spec%2F' + 'with%20slash',
    )
    expect(
      screen.getByText(
        'Specification fetch failed (500): Specification missing',
      ),
    ).toBeInTheDocument()
  })
})
