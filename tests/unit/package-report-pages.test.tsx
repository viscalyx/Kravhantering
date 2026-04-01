import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import PdfListReportPage from '@/app/[locale]/kravpaket/[slug]/reports/pdf/list/page'
import PrintListReportPage from '@/app/[locale]/kravpaket/[slug]/reports/print/list/page'

let currentIds: string | null = null
let currentLocale = 'en'
let currentSlug: string | null = null
let currentDownloading = false
let currentPdfError: string | null = null

const fetchMultipleRequirementsMock = vi.fn()
const buildListReportMock = vi.fn()
const downloadMock = vi.fn()

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

vi.mock('@/components/reports/pdf/usePdfDownload', () => ({
  usePdfDownload: () => ({
    download: downloadMock,
    downloading: currentDownloading,
    error: currentPdfError,
  }),
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
    currentDownloading = false
    currentIds = null
    currentLocale = 'en'
    currentPdfError = null
    currentSlug = null
    buildListReportMock.mockReturnValue({ title: 'Report' })
    downloadMock.mockResolvedValue(undefined)
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

  it('marks the pdf loading state while the report is being fetched', () => {
    currentIds = '1'
    fetchMultipleRequirementsMock.mockReturnValue(new Promise(() => {}))

    const { container } = render(<PdfListReportPage />)

    expect(
      container.querySelector(
        '[data-developer-mode-name="report state"][data-developer-mode-value="report-pdf:loading"]',
      ),
    ).toBeInTheDocument()
  })

  it('marks the pdf error state and clears loading for whitespace-only ids', async () => {
    currentIds = ' , , '
    fetchMultipleRequirementsMock.mockResolvedValue([])

    const { container } = render(<PdfListReportPage />)

    expect(await screen.findByText('reports.errorTitle')).toBeInTheDocument()
    expect(
      container.querySelector(
        '[data-developer-mode-name="report state"][data-developer-mode-value="report-pdf:loading"]',
      ),
    ).not.toBeInTheDocument()
    expect(
      container.querySelector(
        '[data-developer-mode-name="report state"][data-developer-mode-value="report-pdf:error"]',
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

  it('clears previous pdf errors, trims ids, and marks the ready state', async () => {
    fetchMultipleRequirementsMock.mockResolvedValue([{ id: 1 }, { id: 2 }])
    currentSlug = 'pkg/with slash'
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        businessNeedsReference: null,
        implementationType: null,
        name: 'Security package',
        responsibilityArea: null,
        uniqueId: 'SECURITY',
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const { container, rerender } = render(<PdfListReportPage />)

    await screen.findByText('reports.errorTitle')
    expect(
      container.querySelector(
        '[data-developer-mode-name="report state"][data-developer-mode-value="report-pdf:error"]',
      ),
    ).toBeInTheDocument()

    currentIds = ' 1, 2 '
    rerender(<PdfListReportPage />)

    await waitFor(() => {
      expect(fetchMultipleRequirementsMock).toHaveBeenCalledWith(
        ['1', '2'],
        'en',
      )
    })
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/requirement-packages/pkg%2F' + 'with%20slash',
    )
    await waitFor(() => {
      expect(screen.getByText('reports.pdfDownloadStarted')).toBeInTheDocument()
    })
    expect(
      container.querySelector(
        '[data-developer-mode-name="report state"][data-developer-mode-value="report-pdf:ready"]',
      ),
    ).toBeInTheDocument()

    expect(downloadMock).toHaveBeenCalled()
    expect(buildListReportMock).toHaveBeenCalledWith(
      [{ id: 1 }, { id: 2 }],
      'en',
      {
        businessNeedsReference: null,
        implementationType: null,
        name: 'Security package',
        responsibilityArea: null,
        uniqueId: 'SECURITY',
      },
    )
    expect(screen.queryByText('reports.errorTitle')).not.toBeInTheDocument()
  })

  it('extracts readable package error details from JSON responses on the pdf page', async () => {
    currentIds = '1'
    currentSlug = 'pkg/with slash'
    fetchMultipleRequirementsMock.mockResolvedValue([{ id: 1 }])
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => JSON.stringify({ error: 'Package missing' }),
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<PdfListReportPage />)

    expect(await screen.findByText('reports.errorTitle')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/requirement-packages/pkg%2F' + 'with%20slash',
    )
    expect(
      screen.getByText('Package fetch failed (500): Package missing'),
    ).toBeInTheDocument()
  })

  it('hides a stale pdf generation error when a different report starts loading', async () => {
    const firstDownload = createDeferred<void>()
    const secondRequest = createDeferred<{ id: number }[]>()

    currentIds = '1'
    currentPdfError = 'Failed to generate PDF'
    currentSlug = 'pkg-one'
    fetchMultipleRequirementsMock
      .mockResolvedValueOnce([{ id: 1 }])
      .mockImplementationOnce(() => secondRequest.promise)
    downloadMock.mockImplementation(() => firstDownload.promise)

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        businessNeedsReference: null,
        implementationType: null,
        name: 'Security package',
        responsibilityArea: null,
        uniqueId: 'SECURITY',
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const { container, rerender } = render(<PdfListReportPage />)

    await act(async () => {
      firstDownload.resolve(undefined)
    })
    await waitFor(() => {
      expect(screen.getByText('reports.errorTitle')).toBeInTheDocument()
    })

    currentIds = '2'
    currentLocale = 'sv'
    currentSlug = 'pkg-two'
    rerender(<PdfListReportPage />)

    await waitFor(() => {
      expect(
        container.querySelector(
          '[data-developer-mode-name="report state"][data-developer-mode-value="report-pdf:loading"]',
        ),
      ).toBeInTheDocument()
    })

    // currentPdfError can still hold the previous failure in mocked hook state,
    // but once a new PdfListReportPage request starts loading, the updated
    // lastSettledDownloadKey no longer matches that stale download context, so
    // the UI stops rendering the old error.
    expect(screen.queryByText('reports.errorTitle')).not.toBeInTheDocument()
    expect(screen.queryByText('Failed to generate PDF')).not.toBeInTheDocument()

    await act(async () => {
      secondRequest.resolve([{ id: 2 }])
    })
  })

  it('ignores stale pdf responses when a newer request finishes first', async () => {
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
    const { rerender } = render(<PdfListReportPage />)

    currentIds = '2'
    rerender(<PdfListReportPage />)

    secondRequest.resolve([{ id: 2 }])
    await waitFor(() => {
      expect(buildListReportMock).toHaveBeenCalledWith(
        [{ id: 2 }],
        'en',
        undefined,
      )
    })
    await waitFor(() => expect(downloadMock).toHaveBeenCalledTimes(1))

    firstRequest.resolve([{ id: 1 }])
    await waitFor(() => {
      expect(buildListReportMock).toHaveBeenCalledTimes(1)
      expect(downloadMock).toHaveBeenCalledTimes(1)
    })
  })

  it('renders the pdf retry button with an accessible loading state', async () => {
    currentDownloading = true
    currentIds = '1'
    fetchMultipleRequirementsMock.mockResolvedValue([{ id: 1 }])

    render(<PdfListReportPage />)

    const button = await screen.findByRole('button', {
      name: 'reports.generatingPdf',
    })

    await waitFor(() => expect(downloadMock).toHaveBeenCalledTimes(1))

    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-busy', 'true')
    expect(button.className).toContain('min-h-[44px]')
    expect(button.className).toContain('focus-visible:outline')

    fireEvent.click(button)
    expect(downloadMock).toHaveBeenCalledTimes(1)
  })
})
