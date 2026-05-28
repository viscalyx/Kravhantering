import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useServerPdfDownload } from '@/components/reports/pdf/useServerPdfDownload'
import { downloadBlob } from '@/lib/browser-download'

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string) => {
    const translations: Record<string, string> = {
      'common.close': 'Close',
      'reports.errorTitle': 'Error',
      'reports.failedToLoadReport': 'Failed to load report',
      'reports.generatingPdf': 'Generating PDF...',
      'reports.generatingPdfTitle': 'Preparing PDF',
    }

    return translations[`${namespace}.${key}`] ?? `${namespace}.${key}`
  },
}))

vi.mock('@/lib/browser-download', () => ({
  downloadBlob: vi.fn(),
}))

const fetchMock = vi.fn()

function pdfResponse(body = '%PDF', headers?: HeadersInit): Response {
  return {
    blob: async () => new Blob([body], { type: 'application/pdf' }),
    headers: new Headers({
      'Content-Disposition':
        'attachment; filename="fallback.pdf"; filename*=UTF-8\'\'server.pdf',
      'Content-Type': 'application/pdf',
      ...headers,
    }),
    ok: true,
  } as Response
}

function errorResponse(message: string): Response {
  return {
    headers: new Headers({ 'Content-Type': 'application/json' }),
    json: async () => ({ error: message }),
    ok: false,
    status: 500,
  } as Response
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>(resolvePromise => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

async function flushMicrotasks() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

function PdfDownloadProbe() {
  const pdf = useServerPdfDownload()
  return (
    <>
      <button
        onClick={() =>
          void pdf.download({
            fallbackFilename: 'fallback.pdf',
            url: '/reports/test.pdf',
          })
        }
        type="button"
      >
        Download
      </button>
      {pdf.dialog}
    </>
  )
}

describe('useServerPdfDownload', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
    vi.mocked(downloadBlob).mockClear()
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('does not show the modal for fast downloads', async () => {
    fetchMock.mockResolvedValueOnce(pdfResponse())
    render(<PdfDownloadProbe />)

    fireEvent.click(screen.getByRole('button', { name: 'Download' }))
    await flushMicrotasks()

    expect(downloadBlob).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(downloadBlob).toHaveBeenCalledWith(expect.any(Blob), 'server.pdf')
  })

  it('shows the modal after two seconds and closes it when download starts', async () => {
    const pending = deferred<Response>()
    fetchMock.mockReturnValueOnce(pending.promise)
    render(<PdfDownloadProbe />)

    fireEvent.click(screen.getByRole('button', { name: 'Download' }))

    act(() => {
      vi.advanceTimersByTime(1999)
    })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(
      screen.getByRole('dialog', { name: 'Preparing PDF' }),
    ).toBeInTheDocument()

    pending.resolve(pdfResponse())
    await flushMicrotasks()

    expect(downloadBlob).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('closes the progress modal and shows feedback when generation fails', async () => {
    const pending = deferred<Response>()
    fetchMock.mockReturnValueOnce(pending.promise)
    render(<PdfDownloadProbe />)

    fireEvent.click(screen.getByRole('button', { name: 'Download' }))
    act(() => {
      vi.advanceTimersByTime(2000)
    })
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    pending.resolve(errorResponse('PDF generation failed'))
    await flushMicrotasks()

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(
      screen.getByRole('alertdialog', { name: 'Error' }),
    ).toBeInTheDocument()
    expect(screen.getByText('PDF generation failed')).toBeInTheDocument()
    expect(downloadBlob).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })
})
