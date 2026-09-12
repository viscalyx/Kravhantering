import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StrictMode, useLayoutEffect, useRef } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ActionAuditLogExportButton from '@/components/admin/ActionAuditLogExportButton'
import { downloadBlob } from '@/lib/browser-download'

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string) => {
    const translations: Record<string, string> = {
      'common.cancel': 'Cancel',
      'generatedOutput.fileReady': 'The file is ready',
      'generatedOutput.phases.csv.downloading': 'Downloading CSV…',
      'generatedOutput.phases.csv.generating': 'Preparing CSV export…',
    }
    return translations[`${namespace}.${key}`] ?? `${namespace}.${key}`
  },
}))

vi.mock('@/lib/browser-download', () => ({
  downloadBlob: vi.fn(),
}))

const fetchMock = vi.fn()

describe('ActionAuditLogExportButton in Strict Mode', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    vi.mocked(downloadBlob).mockClear()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('completes one export started before passive effects are replayed', async () => {
    let requestSignal: AbortSignal | undefined
    let resolveResponse!: (response: Response) => void
    fetchMock.mockImplementationOnce((_url, init) => {
      requestSignal = init.signal
      return new Promise((resolve, reject) => {
        resolveResponse = resolve
        requestSignal?.addEventListener('abort', () =>
          reject(new DOMException('Aborted', 'AbortError')),
        )
      })
    })
    function EarlyClick() {
      const clicked = useRef(false)
      useLayoutEffect(() => {
        if (!clicked.current) {
          clicked.current = true
          screen.getByRole('button', { name: 'Export CSV' }).click()
        }
      }, [])
      return (
        <ActionAuditLogExportButton
          fallbackFilename="early.csv"
          href="/api/admin/audit-events?format=csv"
          label="Export CSV"
        />
      )
    }
    render(
      <StrictMode>
        <EarlyClick />
      </StrictMode>,
    )
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(requestSignal?.aborted).toBe(false)
    await act(async () => resolveResponse(new Response('exported rows')))
    expect(downloadBlob).toHaveBeenCalledTimes(1)
    expect(downloadBlob).toHaveBeenCalledWith(expect.any(Blob), 'early.csv')
    expect(screen.getByRole('button', { name: 'Export CSV' })).toBeEnabled()
  })

  it('cancels the request when the exporting component is removed', async () => {
    let requestSignal: AbortSignal | undefined
    fetchMock.mockImplementationOnce((_url, init) => {
      requestSignal = init.signal
      return new Promise((_resolve, reject) => {
        requestSignal?.addEventListener('abort', () =>
          reject(new DOMException('Aborted', 'AbortError')),
        )
      })
    })
    const { unmount } = render(
      <ActionAuditLogExportButton
        fallbackFilename="cancel.csv"
        href="/api/admin/audit-events?format=csv"
        label="Export CSV"
      />,
    )
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Export CSV' }))
    unmount()
    await waitFor(() => expect(requestSignal?.aborted).toBe(true))
    expect(downloadBlob).not.toHaveBeenCalled()
  })

  it('keeps one click active as exactly one CSV request', async () => {
    const user = userEvent.setup()
    let requestSignal: AbortSignal | undefined
    fetchMock.mockImplementationOnce(
      (_url: string, init: RequestInit | undefined) => {
        requestSignal = init?.signal ?? undefined
        return new Promise((_resolve, reject) => {
          requestSignal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'))
          })
        })
      },
    )

    render(
      <StrictMode>
        <ActionAuditLogExportButton
          fallbackFilename="action-log.csv"
          href="/api/admin/audit-events?format=csv"
          label="Export CSV"
        />
      </StrictMode>,
    )

    const trigger = screen.getByRole('button', { name: 'Export CSV' })
    await user.click(trigger)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/admin/audit-events?format=csv',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
    expect(requestSignal?.aborted).toBe(false)
    expect(trigger).toBeDisabled()
    expect(
      screen.getByRole('dialog', { name: 'Preparing CSV export…' }),
    ).toBeInTheDocument()

    const cancel = screen.getByRole('button', { name: 'Cancel' })
    await waitFor(() => expect(cancel).toHaveFocus())
    expect(fetchMock).toHaveBeenCalledTimes(1)

    await user.click(cancel)

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await waitFor(() => expect(trigger).toHaveFocus())
    expect(requestSignal?.aborted).toBe(true)
  })
})
