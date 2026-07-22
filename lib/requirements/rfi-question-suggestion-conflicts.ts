import { readResponseMessage } from '@/lib/http/response-message'

export const RFI_QUESTION_SUGGESTION_CONFLICT_REASONS = [
  'rfi_question_suggestion_review_already_requested',
  'rfi_question_suggestion_review_required',
  'rfi_question_suggestion_already_resolved',
  'rfi_question_suggestion_not_draft',
] as const

export type RfiQuestionSuggestionConflictReason =
  (typeof RFI_QUESTION_SUGGESTION_CONFLICT_REASONS)[number]

export interface RfiQuestionSuggestionConflictMessages {
  alreadyResolved: string
  notDraft: string
  notFound: string
  reviewAlreadyRequested: string
  reviewRequired: string
}

function isConflictReason(
  value: unknown,
): value is RfiQuestionSuggestionConflictReason {
  return RFI_QUESTION_SUGGESTION_CONFLICT_REASONS.includes(
    value as RfiQuestionSuggestionConflictReason,
  )
}

function messageForReason(
  reason: RfiQuestionSuggestionConflictReason,
  messages: RfiQuestionSuggestionConflictMessages,
): string {
  switch (reason) {
    case 'rfi_question_suggestion_already_resolved':
      return messages.alreadyResolved
    case 'rfi_question_suggestion_not_draft':
      return messages.notDraft
    case 'rfi_question_suggestion_review_already_requested':
      return messages.reviewAlreadyRequested
    case 'rfi_question_suggestion_review_required':
      return messages.reviewRequired
  }
}

export function shouldReloadRfiQuestionSuggestions(response: Response) {
  return response.status === 404 || response.status === 409
}

export async function readRfiQuestionSuggestionMutationError(
  response: Response,
  messages: RfiQuestionSuggestionConflictMessages,
  fallback: string,
): Promise<string> {
  if (response.status === 404) return messages.notFound

  if (response.status === 409) {
    const payload = await response
      .clone()
      .json()
      .catch(() => null)
    const reason =
      payload && typeof payload === 'object' && 'details' in payload
        ? (payload as { details?: { reason?: unknown } }).details?.reason
        : undefined
    if (isConflictReason(reason)) return messageForReason(reason, messages)
  }

  return (await readResponseMessage(response)) ?? fallback
}
