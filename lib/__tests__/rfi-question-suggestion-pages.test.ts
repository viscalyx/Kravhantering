import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchRfiQuestionSuggestionPages } from '@/lib/requirements/rfi-question-suggestion-pages'

describe('fetchRfiQuestionSuggestionPages', () => {
  afterEach(() => vi.useRealTimers())

  it('follows bounded cursors and deduplicates repeated suggestion rows', async () => {
    vi.useFakeTimers()
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          pagination: { hasMore: true, nextCursor: 'cursor-2' },
          suggestions: [{ id: 2 }, { id: 1 }],
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          pagination: { hasMore: false, nextCursor: null },
          suggestions: [{ id: 1 }, { id: 0 }],
        }),
      )

    await expect(
      fetchRfiQuestionSuggestionPages<{ id: number }>(
        '/api/rfi-question-suggestions?areaId=7',
        { errorMessage: 'Failed', fetchPage },
      ),
    ).resolves.toEqual([{ id: 2 }, { id: 1 }, { id: 0 }])
    expect(fetchPage).toHaveBeenNthCalledWith(
      1,
      '/api/rfi-question-suggestions?areaId=7',
      expect.any(AbortSignal),
    )
    expect(fetchPage).toHaveBeenNthCalledWith(
      2,
      '/api/rfi-question-suggestions?areaId=7&cursor=cursor-2',
      expect.any(AbortSignal),
    )
    expect(fetchPage.mock.calls[0]?.[1]).toBe(fetchPage.mock.calls[1]?.[1])
    expect(vi.getTimerCount()).toBe(0)
  })

  it('rejects a repeated cursor before another request can amplify work', async () => {
    const fetchPage = vi.fn(async () =>
      Response.json({
        pagination: { hasMore: true, nextCursor: 'same-cursor' },
        suggestions: [{ id: 1 }],
      }),
    )

    await expect(
      fetchRfiQuestionSuggestionPages<{ id: number }>(
        '/api/rfi-question-suggestions',
        { errorMessage: 'Failed', fetchPage },
      ),
    ).rejects.toThrow('Failed')
    expect(fetchPage).toHaveBeenCalledTimes(2)
  })

  it('rejects aggregate response bytes before retaining another page', async () => {
    let page = 0
    const fetchPage = vi.fn(async () => {
      page += 1
      return Response.json({
        pagination: { hasMore: true, nextCursor: `cursor-${page}` },
        suggestions: [{ content: 'x'.repeat(1_048_000), id: page }],
      })
    })

    await expect(
      fetchRfiQuestionSuggestionPages<{ content: string; id: number }>(
        '/api/rfi-question-suggestions',
        { errorMessage: 'Failed', fetchPage },
      ),
    ).rejects.toThrow('Failed')
    expect(fetchPage).toHaveBeenCalledTimes(9)
  })

  it('aborts a stalled traversal when its shared deadline expires', async () => {
    vi.useFakeTimers()
    const fetchPage = vi.fn(
      (_url: string, signal: AbortSignal) =>
        new Promise<Response>((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason), {
            once: true,
          })
        }),
    )

    const traversal = fetchRfiQuestionSuggestionPages<{ id: number }>(
      '/api/rfi-question-suggestions',
      { errorMessage: 'Failed', fetchPage },
    )
    const rejection = expect(traversal).rejects.toThrow()
    await vi.advanceTimersByTimeAsync(30_000)

    await rejection
    expect(fetchPage.mock.calls[0]?.[1].aborted).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })
})
