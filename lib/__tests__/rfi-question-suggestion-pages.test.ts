import { describe, expect, it, vi } from 'vitest'
import { fetchRfiQuestionSuggestionPages } from '@/lib/requirements/rfi-question-suggestion-pages'

describe('fetchRfiQuestionSuggestionPages', () => {
  it('follows bounded cursors and deduplicates repeated suggestion rows', async () => {
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
    )
    expect(fetchPage).toHaveBeenNthCalledWith(
      2,
      '/api/rfi-question-suggestions?areaId=7&cursor=cursor-2',
    )
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
})
