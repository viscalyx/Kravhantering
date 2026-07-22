import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useReducedMotion } from 'framer-motion'
import { useRef, useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useGeneratedOutputDownload } from '@/components/generated-output/useGeneratedOutputDownload'
import { downloadBlob } from '@/lib/browser-download'

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string, values?: object) => {
    const translations: Record<string, string> = {
      'common.cancel': 'Cancel',
      'common.close': 'Close',
      'generatedOutput.fileReady': 'The file is ready',
      'generatedOutput.errors.pdf.busy': `Busy ${String(
        (values as { retryAfter?: number } | undefined)?.retryAfter,
      )}`,
      'generatedOutput.errors.csv.bytes': 'CSV byte limit',
      'generatedOutput.errors.csv.items': 'CSV item limit',
      'generatedOutput.errors.csv.storage': 'CSV storage unavailable',
      'generatedOutput.errors.csv.timeout': 'CSV timeout',
      'generatedOutput.errors.csv.unknown': 'Safe CSV error',
      'generatedOutput.errors.pdf.unknown': 'Safe PDF error',
      'generatedOutput.errors.pdf.workerFailed': 'PDF worker failed',
      'generatedOutput.errors.pdf.workerMemory': 'PDF worker memory',
      'generatedOutput.errorTitle': 'Download failed',
      'generatedOutput.phases.csv.downloading': 'Downloading CSV…',
      'generatedOutput.phases.csv.generating': 'Preparing CSV export…',
      'generatedOutput.phases.pdf.downloading': 'Downloading PDF…',
      'generatedOutput.phases.pdf.generating': 'Generating PDF…',
      'generatedOutput.retry': 'Retry',
      'generatedOutput.retryCountdown': `Retry in ${String(
        (values as { seconds?: number } | undefined)?.seconds,
      )} s`,
    }
    return translations[`${namespace}.${key}`] ?? `${namespace}.${key}`
  },
}))

vi.mock('@/lib/browser-download', () => ({
  downloadBlob: vi.fn(),
}))

const fetchMock = vi.fn()

function responseWithBlob(
  blobPromise: Promise<Blob>,
  headers?: HeadersInit,
): Response {
  return {
    blob: () => blobPromise,
    headers: new Headers({
      'Content-Disposition':
        'attachment; filename="fallback.pdf"; filename*=UTF-8\'\'server.pdf',
      'Content-Type': 'application/pdf',
      ...headers,
    }),
    ok: true,
  } as Response
}

function errorResponse(
  code: string,
  details: Record<string, unknown>,
  headers?: HeadersInit,
): Response {
  return {
    headers: new Headers({
      'Content-Type': 'application/json',
      ...headers,
    }),
    json: async () => ({
      code,
      details,
      error: 'RAW SERVER TEXT MUST NOT BE SHOWN',
    }),
    ok: false,
    status: code === 'capacity_busy' ? 429 : 500,
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

function DownloadProbe({
  output = 'pdf',
  url = '/reports/test.pdf',
}: {
  output?: 'csv' | 'pdf'
  url?: string
}) {
  const download = useGeneratedOutputDownload()
  return (
    <>
      <button
        onClick={() =>
          void download.download({
            fallbackFilename: `fallback.${output}`,
            output,
            url,
          })
        }
        type="button"
      >
        Download
      </button>
      {download.dialog}
    </>
  )
}

function MenuDownloadProbe() {
  const download = useGeneratedOutputDownload()
  const reportsButtonRef = useRef<HTMLButtonElement>(null)
  const [menuOpen, setMenuOpen] = useState(true)

  return (
    <>
      <button ref={reportsButtonRef} type="button">
        Reports
      </button>
      {menuOpen ? (
        <button
          onClick={() => {
            void download.download({
              fallbackFilename: 'requirements-list.pdf',
              restoreFocusTo: reportsButtonRef.current,
              url: '/reports/from-menu.pdf',
            })
            setMenuOpen(false)
          }}
          type="button"
        >
          Requirements list
        </button>
      ) : null}
      {download.dialog}
    </>
  )
}

function ConcurrentDownloadProbe() {
  const download = useGeneratedOutputDownload()

  return (
    <>
      <button
        onClick={() =>
          void download.download({
            fallbackFilename: 'first.csv',
            output: 'csv',
            url: '/exports/first',
          })
        }
        type="button"
      >
        First
      </button>
      <button
        onClick={() =>
          void download.download({
            fallbackFilename: 'second.pdf',
            url: '/reports/second',
          })
        }
        type="button"
      >
        Second
      </button>
      {download.dialog}
    </>
  )
}

describe('useGeneratedOutputDownload', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
    vi.mocked(downloadBlob).mockClear()
    vi.mocked(useReducedMotion).mockReturnValue(false)
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('opens immediately, switches phase after headers, and uses the server filename', async () => {
    const response = deferred<Response>()
    const blob = deferred<Blob>()
    fetchMock.mockReturnValueOnce(response.promise)
    render(<DownloadProbe />)

    fireEvent.click(screen.getByRole('button', { name: 'Download' }))
    expect(
      screen.getByRole('dialog', { name: 'Generating PDF…' }),
    ).toBeInTheDocument()
    expect(screen.getAllByText('Generating PDF…')).toHaveLength(1)

    response.resolve(responseWithBlob(blob.promise))
    await flushMicrotasks()
    expect(
      screen.getByRole('dialog', { name: 'Downloading PDF…' }),
    ).toBeInTheDocument()
    expect(screen.getAllByText('Downloading PDF…')).toHaveLength(1)

    blob.resolve(new Blob(['%PDF'], { type: 'application/pdf' }))
    await flushMicrotasks()
    expect(downloadBlob).toHaveBeenCalledWith(expect.any(Blob), 'server.pdf')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('The file is ready')

    act(() => vi.advanceTimersByTime(3999))
    expect(screen.getByRole('status')).toHaveTextContent('The file is ready')
    act(() => vi.advanceTimersByTime(1))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('uses the shared CSV phases', async () => {
    const response = deferred<Response>()
    const blob = deferred<Blob>()
    fetchMock.mockReturnValueOnce(response.promise)
    render(<DownloadProbe output="csv" url="/reports/test-csv" />)

    fireEvent.click(screen.getByRole('button', { name: 'Download' }))
    expect(
      screen.getByRole('dialog', { name: 'Preparing CSV export…' }),
    ).toBeInTheDocument()
    expect(screen.getAllByText('Preparing CSV export…')).toHaveLength(1)
    response.resolve(
      responseWithBlob(blob.promise, {
        'Content-Disposition': 'attachment; filename="kravbibliotek.csv"',
        'Content-Type': 'text/csv',
      }),
    )
    await flushMicrotasks()
    expect(
      screen.getByRole('dialog', { name: 'Downloading CSV…' }),
    ).toBeInTheDocument()
    expect(screen.getAllByText('Downloading CSV…')).toHaveLength(1)
    blob.resolve(new Blob(['csv']))
    await flushMicrotasks()
    expect(downloadBlob).toHaveBeenCalledWith(
      expect.any(Blob),
      'kravbibliotek.csv',
    )
  })

  it('allows only one active operation per hook across different URLs', () => {
    fetchMock.mockReturnValueOnce(new Promise(() => {}))
    render(<ConcurrentDownloadProbe />)

    fireEvent.click(screen.getByRole('button', { name: 'First' }))
    fireEvent.click(screen.getByRole('button', { name: 'Second' }))

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(
      '/exports/first',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
    expect(
      screen.getByRole('dialog', { name: 'Preparing CSV export…' }),
    ).toBeInTheDocument()
  })

  it('cancels the active fetch and restores trigger focus', async () => {
    fetchMock.mockImplementationOnce(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          )
        }),
    )
    render(<DownloadProbe url="/reports/cancel.pdf" />)
    const trigger = screen.getByRole('button', { name: 'Download' })
    trigger.focus()
    fireEvent.click(trigger)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await flushMicrotasks()
    act(() => {
      vi.runOnlyPendingTimers()
    })

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
    expect(downloadBlob).not.toHaveBeenCalled()
  })

  it('closes and restores focus when cancelled while the blob resolves', async () => {
    const blob = deferred<Blob>()
    fetchMock.mockResolvedValueOnce(responseWithBlob(blob.promise))
    render(<DownloadProbe url="/reports/cancel-download.pdf" />)
    const trigger = screen.getByRole('button', { name: 'Download' })
    trigger.focus()
    fireEvent.click(trigger)
    await flushMicrotasks()

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    blob.resolve(new Blob(['%PDF'], { type: 'application/pdf' }))
    await flushMicrotasks()
    act(() => {
      vi.runOnlyPendingTimers()
    })

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
    expect(downloadBlob).not.toHaveBeenCalled()
  })

  it('restores explicit trigger focus after the initiating menu item unmounts', async () => {
    const blob = deferred<Blob>()
    fetchMock.mockResolvedValueOnce(responseWithBlob(blob.promise))
    render(<MenuDownloadProbe />)

    const reportsButton = screen.getByRole('button', { name: 'Reports' })
    const menuItem = screen.getByRole('button', {
      name: 'Requirements list',
    })
    menuItem.focus()
    fireEvent.click(menuItem)
    expect(menuItem).not.toBeInTheDocument()

    blob.resolve(new Blob(['%PDF'], { type: 'application/pdf' }))
    await flushMicrotasks()
    act(() => {
      vi.runOnlyPendingTimers()
    })

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(reportsButton).toHaveFocus()
  })

  it('keeps indeterminate progress static when reduced motion is requested', () => {
    vi.mocked(useReducedMotion).mockReturnValue(true)
    fetchMock.mockReturnValueOnce(new Promise(() => {}))
    render(<DownloadProbe url="/reports/reduced-motion.pdf" />)

    fireEvent.click(screen.getByRole('button', { name: 'Download' }))
    const progressBar = screen
      .getByRole('dialog', { name: 'Generating PDF…' })
      .querySelector('.bg-primary-600')
    expect(progressBar).toBeInTheDocument()
    expect(progressBar).not.toHaveClass('animate-pulse')
  })

  it('uses only stable codes and enforces Retry-After countdown', async () => {
    fetchMock.mockResolvedValueOnce(
      errorResponse(
        'capacity_busy',
        { output: 'pdf', retryAfterSeconds: 2 },
        { 'Retry-After': '2' },
      ),
    )
    render(<DownloadProbe url="/reports/busy.pdf" />)

    fireEvent.click(screen.getByRole('button', { name: 'Download' }))
    await flushMicrotasks()

    expect(
      screen.getByRole('alertdialog', { name: 'Download failed' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Busy 2')).toBeInTheDocument()
    expect(screen.queryByText(/RAW SERVER/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry in 2 s' })).toBeDisabled()
    act(() => vi.advanceTimersByTime(2000))
    expect(screen.getByRole('button', { name: 'Retry' })).toBeEnabled()
  })

  it('falls back to a localized unknown error instead of raw text', async () => {
    fetchMock.mockResolvedValueOnce(
      errorResponse('unrecognized_code', { output: 'pdf' }),
    )
    render(<DownloadProbe url="/reports/error.pdf" />)

    fireEvent.click(screen.getByRole('button', { name: 'Download' }))
    await flushMicrotasks()
    expect(screen.getByText('Safe PDF error')).toBeInTheDocument()
    expect(screen.queryByText(/RAW SERVER/)).not.toBeInTheDocument()
  })

  it('uses the requested output fallback when an error body is malformed', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('invalid JSON', { status: 500 }),
    )
    render(<DownloadProbe output="csv" url="/reports/malformed-error" />)

    fireEvent.click(screen.getByRole('button', { name: 'Download' }))
    await flushMicrotasks()

    expect(screen.getByText('Safe CSV error')).toBeInTheDocument()
    expect(screen.queryByText(/invalid JSON/)).not.toBeInTheDocument()
  })

  it.each([
    {
      code: 'output_limit_exceeded',
      details: { limit: 2, limitKind: 'items', output: 'csv' },
      expected: 'CSV item limit',
      output: 'csv' as const,
    },
    {
      code: 'output_limit_exceeded',
      details: { limit: 1024, limitKind: 'bytes', output: 'csv' },
      expected: 'CSV byte limit',
      output: 'csv' as const,
    },
    {
      code: 'generation_timeout',
      details: { output: 'csv', timeoutSeconds: 120 },
      expected: 'CSV timeout',
      output: 'csv' as const,
    },
    {
      code: 'temporary_storage_unavailable',
      details: { output: 'csv' },
      expected: 'CSV storage unavailable',
      output: 'csv' as const,
    },
    {
      code: 'pdf_worker_memory_exceeded',
      details: { output: 'pdf' },
      expected: 'PDF worker memory',
      output: 'pdf' as const,
    },
    {
      code: 'pdf_worker_failed',
      details: { output: 'pdf' },
      expected: 'PDF worker failed',
      output: 'pdf' as const,
    },
  ])('localizes the stable $code error', async testCase => {
    fetchMock.mockResolvedValueOnce(
      errorResponse(testCase.code, testCase.details),
    )
    render(
      <DownloadProbe
        output={testCase.output}
        url={`/reports/${testCase.code}`}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Download' }))
    await flushMicrotasks()
    expect(screen.getByText(testCase.expected)).toBeInTheDocument()
  })
})
