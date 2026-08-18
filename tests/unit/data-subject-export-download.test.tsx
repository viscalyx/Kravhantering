import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useDataSubjectExportDownload } from '@/components/privacy/useDataSubjectExportDownload'

const state = vi.hoisted(() => ({
  generatedDownload: vi.fn(),
}))

vi.mock('@/components/generated-output/useGeneratedOutputDownload', () => ({
  useGeneratedOutputDownload: () => ({
    dialog: <span>generated dialog</span>,
    download: state.generatedDownload,
    downloading: false,
    error: null,
  }),
}))

describe('useDataSubjectExportDownload', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('downloads JSON and PDF through the bounded generated-output flow', async () => {
    const { result } = renderHook(() =>
      useDataSubjectExportDownload({
        locale: 'sv',
        targetHsaId: 'SE5560000001-subject1',
      }),
    )
    await act(() => result.current.download({ delivery: 'json' }))
    expect(state.generatedDownload).toHaveBeenCalledWith(
      expect.objectContaining({
        fallbackFilename: 'personuppgiftsutdrag.json',
        output: 'json',
      }),
    )

    await act(() => result.current.download({ delivery: 'pdf' }))
    expect(state.generatedDownload).toHaveBeenCalledWith(
      expect.objectContaining({ output: 'pdf' }),
    )
    const jsonRequest = state.generatedDownload.mock.calls[0][0]
    expect(JSON.parse(jsonRequest.init.body)).toEqual({
      delivery: 'json',
      locale: 'sv',
      target: { hsaId: 'SE5560000001-subject1' },
    })
  })

  it('uses localized fallback filenames without adding a target override', async () => {
    const { result } = renderHook(() =>
      useDataSubjectExportDownload({ locale: 'en', targetHsaId: undefined }),
    )
    await act(() => result.current.download({ delivery: 'pdf' }))
    expect(state.generatedDownload).toHaveBeenCalledWith(
      expect.objectContaining({
        fallbackFilename: 'data-subject-access-export.pdf',
        output: 'pdf',
      }),
    )
    await act(() => result.current.download({ delivery: 'json' }))
    const jsonRequest = state.generatedDownload.mock.calls[1][0]
    expect(JSON.parse(jsonRequest.init.body)).toEqual({
      delivery: 'json',
      locale: 'en',
    })
  })
})
