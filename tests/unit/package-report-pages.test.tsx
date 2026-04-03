import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import PrintListReportPage from '@/app/[locale]/requirement-packages/[slug]/reports/print/list/page'

let currentIds: string | null = null
let currentLocale = 'en'
let currentSlug: string | null = null

const fetchMultipleRequirementsMock = vi.fn()
const buildListReportMock = vi.fn()

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
    get: (key: string) => (key === 'ids' ? currentIds : null),
  }),
}))

vi.mock('next-intl', () => ({
  useLocale: () => currentLocale,
  useTranslations:
    (namespace?: string) =>
    (key: string, values?: Record<string, string | number>) => {
      if (namespace === 'reports' && key === 'packageFetchFailed') {
        return `Package fetch failed (${values?.status})`
      }
      if (namespace === 'reports' && key === 'packageFetchFailedWithDetails') {
        return `Package fetch failed (${values?.status}): ${values?.details}`
      }
      return namespace ? `${namespace}.${key}` : key
    },
}))

vi.mock('@/components/reports/print/PrintReportRenderer', () => ({
  default: ({ model }: { model: unknown }) => (
    <section aria-label="Print renderer">{JSON.stringify(model)}</section>
  ),
}))

vi.mock('@/lib/reports/data/fetch-requirement', () => ({
  fetchMultipleRequirements: (...args: unknown[]) =>
    fetchMultipleRequirementsMock(...args),
}))

vi.mock('@/lib/reports/templates/list-template', () => ({
  buildListReport: (...args: unknown[]) => buildListReportMock(...args),
}))

describe('requirement package report pages', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('print', vi.fn())
    currentIds = null
    currentLocale = 'en'
    currentSlug = null
    buildListReportMock.mockReturnValue({ title: 'Report' })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('marks the print loading state while the report is being fetched', () => {
    currentIds = '1'
    fetchMultipleRequirementsMock.mockReturnValue(new Promise(() => {}))

    const { container } = render(<PrintListReportPage />)

    expect(
      container.querySelector(
        '[data-developer-mode-name="report state"][data-developer-mode-value="report-print:loading"]',
      ),
    ).toBeInTheDocument()
  })

  it('clears previous print errors, trims ids, and marks the renderer state', async () => {
    fetchMultipleRequirementsMock.mockResolvedValue([{ id: 1 }, { id: 2 }])

    const { container, rerender } = render(<PrintListReportPage />)

    await screen.findByText('reports.errorTitle')
    expect(
      container.querySelector(
        '[data-developer-mode-name="report state"][data-developer-mode-value="report-print:error"]',
      ),
    ).toBeInTheDocument()

    currentIds = ' 1, 2 '
    rerender(<PrintListReportPage />)

    await waitFor(() => {
      expect(fetchMultipleRequirementsMock).toHaveBeenCalledWith(
        ['1', '2'],
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

    fetchMultipleRequirementsMock
      .mockImplementationOnce(() => firstRequest.promise)
      .mockImplementationOnce(() => secondRequest.promise)
    buildListReportMock.mockImplementation(
      (requirements: { id: number }[]) => ({
        title: `Report ${requirements[0]?.id}`,
      }),
    )

    currentIds = '1'
    const { rerender } = render(<PrintListReportPage />)

    currentIds = '2'
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

  it('extracts readable package error details from JSON responses', async () => {
    currentIds = '1'
    currentSlug = 'pkg/with slash'
    fetchMultipleRequirementsMock.mockResolvedValue([{ id: 1 }])
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => JSON.stringify({ error: 'Package missing' }),
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<PrintListReportPage />)

    expect(await screen.findByText('reports.errorTitle')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/requirement-packages/pkg%2F' + 'with%20slash',
    )
    expect(
      screen.getByText('Package fetch failed (500): Package missing'),
    ).toBeInTheDocument()
  })
})
