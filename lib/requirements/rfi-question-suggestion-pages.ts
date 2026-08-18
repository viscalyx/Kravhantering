import { apiFetch } from '@/lib/http/api-fetch'
import { readResponseMessage } from '@/lib/http/response-message'

const MAX_COMPLETE_RFI_QUESTION_SUGGESTION_ITEMS = 2_000
const MAX_COMPLETE_RFI_QUESTION_SUGGESTION_PAGES = 20
const MAX_COMPLETE_RFI_QUESTION_SUGGESTION_BYTES = 8 * 1_048_576
const COMPLETE_RFI_QUESTION_SUGGESTION_DEADLINE_MS = 30_000

interface SuggestionIdentity {
  id: number
}

interface SuggestionPage<T extends SuggestionIdentity> {
  pagination?: {
    hasMore?: boolean
    nextCursor?: string | null
  }
  suggestions?: T[]
}

export interface FetchRfiQuestionSuggestionPagesOptions {
  errorMessage: string
  fetchPage?: (url: string, signal: AbortSignal) => Promise<Response>
}

function withCursor(url: string, cursor: string): string {
  const parsed = new URL(url, 'http://localhost')
  parsed.searchParams.set('cursor', cursor)
  return `${parsed.pathname}${parsed.search}`
}

export async function fetchRfiQuestionSuggestionPages<
  T extends SuggestionIdentity,
>(
  initialUrl: string,
  options: FetchRfiQuestionSuggestionPagesOptions,
): Promise<T[]> {
  const fetchPage =
    options.fetchPage ??
    ((url: string, signal: AbortSignal) => apiFetch(url, { signal }))
  const deadline = new AbortController()
  const deadlineTimeout = setTimeout(
    () => deadline.abort(),
    COMPLETE_RFI_QUESTION_SUGGESTION_DEADLINE_MS,
  )
  const seenCursors = new Set<string>()
  const seenSuggestionIds = new Set<number>()
  const suggestions: T[] = []
  const encoder = new TextEncoder()
  let encodedBytes = 0
  let url = initialUrl

  try {
    for (
      let pageNumber = 1;
      pageNumber <= MAX_COMPLETE_RFI_QUESTION_SUGGESTION_PAGES;
      pageNumber += 1
    ) {
      const response = await fetchPage(url, deadline.signal)
      if (!response.ok) {
        throw new Error(
          (await readResponseMessage(response)) ?? options.errorMessage,
        )
      }
      const page = (await response.json()) as SuggestionPage<T>
      for (const suggestion of page.suggestions ?? []) {
        if (seenSuggestionIds.has(suggestion.id)) continue
        encodedBytes += encoder.encode(JSON.stringify(suggestion)).byteLength
        if (encodedBytes > MAX_COMPLETE_RFI_QUESTION_SUGGESTION_BYTES) {
          throw new Error(options.errorMessage)
        }
        seenSuggestionIds.add(suggestion.id)
        suggestions.push(suggestion)
        if (suggestions.length > MAX_COMPLETE_RFI_QUESTION_SUGGESTION_ITEMS) {
          throw new Error(options.errorMessage)
        }
      }

      if (!page.pagination?.hasMore) return suggestions
      const nextCursor = page.pagination.nextCursor
      if (!nextCursor || seenCursors.has(nextCursor)) {
        throw new Error(options.errorMessage)
      }
      seenCursors.add(nextCursor)
      url = withCursor(initialUrl, nextCursor)
    }

    throw new Error(options.errorMessage)
  } finally {
    clearTimeout(deadlineTimeout)
  }
}
