import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useDataSubjectExportDownload } from '@/components/privacy/useDataSubjectExportDownload'
import { dataSubjectExportFixture } from './helpers/data-subject-export-fixture'

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

describe('useDataSubjectExportDownload', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.apiFetch.mockResolvedValue(
      new Response(JSON.stringify(dataSubjectExportFixture()), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      }),
    )
  })

  it('downloads JSON and PDF and handles rejection and thrown errors', async () => {
    const { result } = renderHook(() =>
      useDataSubjectExportDownload({
        locale: 'sv',
        targetHsaId: 'SE5560000001-subject1',
      }),
    )
    await act(() => result.current.download({ delivery: 'json' }))
    expect(state.downloadBlob).toHaveBeenCalled()

    await act(() => result.current.download({ delivery: 'pdf' }))
    expect(state.generatedDownload).toHaveBeenCalled()

    state.apiFetch.mockResolvedValueOnce(new Response(null, { status: 500 }))
    state.readResponseMessage.mockResolvedValueOnce(null)
    await act(() => result.current.download({ delivery: 'json' }))
    expect(result.current.error).toBe('Export failed')

    state.apiFetch.mockRejectedValueOnce(new Error('offline'))
    await act(() => result.current.download({ delivery: 'json' }))
    expect(result.current.error).toBe('offline')
  })

  it('uses a fallback filename and handles non-Error failures', async () => {
    const { result } = renderHook(() =>
      useDataSubjectExportDownload({ locale: 'en', targetHsaId: undefined }),
    )
    await act(() => result.current.download({ delivery: 'pdf' }))
    expect(state.generatedDownload).toHaveBeenCalledWith(
      expect.objectContaining({
        fallbackFilename: 'data-subject-access-export.pdf',
      }),
    )
    state.apiFetch.mockRejectedValueOnce('offline')
    await act(() => result.current.download({ delivery: 'json' }))
    expect(result.current.error).toBe('Export failed')
  })
})
