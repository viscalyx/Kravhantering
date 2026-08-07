import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAccessReviewExportDownload } from '@/components/access-review/useAccessReviewExportDownload'
import { accessReviewExportFixture } from './helpers/access-review-export-fixture'

const state = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  downloadBlob: vi.fn(),
  generatedDownload: vi.fn(),
  readResponseMessage: vi.fn(),
}))

vi.mock('@/components/generated-output/useGeneratedOutputDownload', () => ({
  useGeneratedOutputDownload: () => ({
    dialog: <span>generated dialog</span>,
    download: state.generatedDownload,
    downloading: false,
    error: null,
  }),
}))
vi.mock('@/lib/browser-download', () => ({ downloadBlob: state.downloadBlob }))
vi.mock('@/lib/http/api-fetch', () => ({ apiFetch: state.apiFetch }))
vi.mock('@/lib/http/response-message', () => ({
  readResponseMessage: state.readResponseMessage,
}))

describe('useAccessReviewExportDownload', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.apiFetch.mockResolvedValue(
      new Response(JSON.stringify(accessReviewExportFixture()), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      }),
    )
  })

  it('downloads JSON and PDF and handles rejection, failure, and empty selection', async () => {
    const { result, rerender } = renderHook(
      ({ reviewId }) =>
        useAccessReviewExportDownload({ locale: 'en', reviewId }),
      { initialProps: { reviewId: 42 as number | null } },
    )
    await act(() => result.current.download({ delivery: 'json' }))
    expect(state.downloadBlob).toHaveBeenCalled()

    await act(() => result.current.download({ delivery: 'pdf' }))
    expect(state.generatedDownload).toHaveBeenCalled()

    state.apiFetch.mockResolvedValueOnce(
      new Response('Denied', { status: 403 }),
    )
    state.readResponseMessage.mockResolvedValueOnce('Denied')
    await act(() => result.current.download({ delivery: 'json' }))
    expect(result.current.error).toBe('Denied')
    act(() => result.current.clearError())
    expect(result.current.error).toBeNull()

    state.apiFetch.mockRejectedValueOnce('offline')
    await act(() => result.current.download({ delivery: 'json' }))
    expect(result.current.error).toBe('Export failed')

    rerender({ reviewId: null })
    await act(() => result.current.download({ delivery: 'json' }))
    expect(result.current.downloading).toBeNull()
  })

  it('uses localized fallbacks and resets errors', async () => {
    const { result } = renderHook(() =>
      useAccessReviewExportDownload({ locale: 'sv', reviewId: 7 }),
    )
    await act(() => result.current.download({ delivery: 'pdf' }))
    expect(state.generatedDownload).toHaveBeenCalledWith(
      expect.objectContaining({ fallbackFilename: 'behorighetsoversyn-7.pdf' }),
    )
    state.apiFetch.mockResolvedValueOnce(new Response(null, { status: 500 }))
    state.readResponseMessage.mockResolvedValueOnce(null)
    await act(() => result.current.download({ delivery: 'json' }))
    expect(result.current.error).toBe('Export failed')
    state.apiFetch.mockRejectedValueOnce(new Error('network down'))
    await act(() => result.current.download({ delivery: 'json' }))
    expect(result.current.error).toBe('network down')
  })
})
