import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createTranslator, NextIntlClientProvider } from 'next-intl'
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest'
import AiRequestFileDownloads from '@/components/AiRequestFileDownloads'
import {
  type AiRequestFileDestination,
  aiRequestFileName,
  aiRequestFileUrl,
} from '@/lib/requirements/ai-request-files'
import svMessages from '@/messages/sv.json'

const downloadBlobMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/browser-download', () => ({ downloadBlob: downloadBlobMock }))

const t = createTranslator({
  locale: 'sv',
  messages: svMessages,
  namespace: 'requirementsImportAiRequest',
})

const SPECIFICATION: AiRequestFileDestination = {
  kind: 'requirements_specification',
  specificationId: 42,
}

function createDeferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(settle => {
    resolve = settle
  })
  return { promise, resolve }
}

function renderDownloads(
  destination: AiRequestFileDestination | null,
  callbacks: {
    onDownloadStart?: () => void
    onError?: Mock<(message: string) => void>
  } = {},
) {
  const onError = callbacks.onError ?? vi.fn<(message: string) => void>()
  render(
    <NextIntlClientProvider locale="sv" messages={svMessages}>
      <AiRequestFileDownloads
        destination={destination}
        locale="sv"
        markerContext="requirements import"
        onDownloadStart={callbacks.onDownloadStart}
        onError={onError}
      />
    </NextIntlClientProvider>,
  )
  return {
    onError,
    referenceData: screen.getByRole('button', {
      name: t('downloadReferenceData'),
    }),
    template: screen.getByRole('button', { name: t('downloadTemplate') }),
  }
}

describe('AiRequestFileDownloads', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    global.fetch = vi.fn()
  })

  it('shows each file name below its button and marks the buttons for Developer Mode', () => {
    const { referenceData, template } = renderDownloads(SPECIFICATION)

    expect(template).toHaveAccessibleDescription(
      aiRequestFileName('template', 'sv', SPECIFICATION),
    )
    expect(referenceData).toHaveAccessibleDescription(
      aiRequestFileName('referenceData', 'sv', SPECIFICATION),
    )
    expect(template).toHaveAttribute(
      'data-developer-mode-value',
      'ai request template',
    )
    expect(referenceData).toHaveAttribute(
      'data-developer-mode-value',
      'reference data file',
    )
  })

  it('downloads the file for the destination and names it', async () => {
    const blob = new Blob(['{}'], { type: 'application/json' })
    vi.mocked(global.fetch).mockResolvedValue({
      blob: async () => blob,
      ok: true,
    } as Response)
    const onDownloadStart = vi.fn()
    const { onError, referenceData } = renderDownloads(SPECIFICATION, {
      onDownloadStart,
    })

    fireEvent.click(referenceData)

    await waitFor(() =>
      expect(downloadBlobMock).toHaveBeenCalledWith(
        blob,
        aiRequestFileName('referenceData', 'sv', SPECIFICATION),
      ),
    )
    expect(global.fetch).toHaveBeenCalledWith(
      aiRequestFileUrl('referenceData', 'sv', SPECIFICATION),
    )
    expect(onDownloadStart).toHaveBeenCalledTimes(1)
    expect(onError).not.toHaveBeenCalled()
    await waitFor(() => expect(referenceData).toBeEnabled())
  })

  it('reports the server message when the download is rejected', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({
        error: 'Du saknar behörighet till kravunderlaget.',
      }),
      ok: false,
    } as Response)
    const { onError, template } = renderDownloads(SPECIFICATION)

    fireEvent.click(template)

    await waitFor(() =>
      expect(onError).toHaveBeenCalledWith(
        'Du saknar behörighet till kravunderlaget.',
      ),
    )
    expect(downloadBlobMock).not.toHaveBeenCalled()
    await waitFor(() => expect(template).toBeEnabled())
  })

  it('reports a generic failure when the request fails or has no message', async () => {
    vi.mocked(global.fetch)
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({
        headers: new Headers(),
        ok: false,
        text: async () => '',
      } as Response)
    const { onError, template } = renderDownloads({
      kind: 'requirements_library',
    })

    fireEvent.click(template)
    await waitFor(() => expect(onError).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(template).toBeEnabled())
    fireEvent.click(template)
    await waitFor(() => expect(onError).toHaveBeenCalledTimes(2))

    expect(onError.mock.calls).toEqual([
      [t('downloadFailed')],
      [t('downloadFailed')],
    ])
    expect(downloadBlobMock).not.toHaveBeenCalled()
  })

  it('disables the other button with a reason while one file downloads', async () => {
    const response = createDeferred<Response>()
    vi.mocked(global.fetch).mockReturnValue(response.promise)
    const { referenceData, template } = renderDownloads(SPECIFICATION)

    fireEvent.click(template)

    expect(template).toBeDisabled()
    expect(template).toHaveTextContent(t('downloading'))
    expect(template).not.toHaveAttribute('title')
    expect(referenceData).toBeDisabled()
    expect(referenceData).toHaveAttribute('title', t('otherDownloadPending'))

    response.resolve({
      blob: async () => new Blob(['x']),
      ok: true,
    } as Response)

    await waitFor(() => expect(referenceData).toBeEnabled())
    expect(referenceData).not.toHaveAttribute('title')
    expect(template).toHaveTextContent(t('downloadTemplate'))
  })

  it('disables both buttons with a reason and hides the file names without a destination', () => {
    const { referenceData, template } = renderDownloads(null)

    for (const button of [template, referenceData]) {
      expect(button).toBeDisabled()
      expect(button).toHaveAttribute('title', t('filesUnavailable'))
      // Without a file name, the reason is the button's only description.
      expect(button).toHaveAccessibleDescription(t('filesUnavailable'))
    }
    fireEvent.click(template)
    expect(global.fetch).not.toHaveBeenCalled()
  })
})
