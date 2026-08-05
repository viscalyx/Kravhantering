import { describe, expect, it } from 'vitest'
import {
  readRfiQuestionSuggestionMutationError,
  shouldReloadRfiQuestionSuggestions,
} from '@/lib/requirements/rfi-question-suggestion-conflicts'

const messages = {
  alreadyResolved: 'The suggestion is already resolved.',
  notDraft: 'The suggestion is no longer a draft.',
  notFound: 'The suggestion could not be found.',
  reviewAlreadyRequested: 'Review was already requested.',
  reviewRequired: 'Review must be requested first.',
}

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    status,
  })
}

describe('RFI question suggestion conflict messages', () => {
  it('reloads stewardship data after not-found and conflict responses', () => {
    expect(
      shouldReloadRfiQuestionSuggestions(new Response(null, { status: 404 })),
    ).toBe(true)
    expect(
      shouldReloadRfiQuestionSuggestions(new Response(null, { status: 409 })),
    ).toBe(true)
    expect(
      shouldReloadRfiQuestionSuggestions(new Response(null, { status: 400 })),
    ).toBe(false)
  })

  it('uses the not-found message for a suggestion that disappeared', async () => {
    await expect(
      readRfiQuestionSuggestionMutationError(
        jsonResponse({ error: 'Not found' }, 404),
        messages,
        'Fallback',
      ),
    ).resolves.toBe(messages.notFound)
  })

  it.each([
    {
      expected: messages.alreadyResolved,
      reason: 'rfi_question_suggestion_already_resolved',
    },
    {
      expected: messages.notDraft,
      reason: 'rfi_question_suggestion_not_draft',
    },
    {
      expected: messages.reviewAlreadyRequested,
      reason: 'rfi_question_suggestion_review_already_requested',
    },
    {
      expected: messages.reviewRequired,
      reason: 'rfi_question_suggestion_review_required',
    },
  ])(
    'maps $reason to its current stewardship message',
    async ({ expected, reason }) => {
      const response = jsonResponse({ details: { reason } }, 409)

      await expect(
        readRfiQuestionSuggestionMutationError(response, messages, 'Fallback'),
      ).resolves.toBe(expected)
    },
  )

  it('uses the server message for an unrecognized conflict reason', async () => {
    const response = jsonResponse(
      { details: { reason: 'new_reason' }, error: 'Current server conflict' },
      409,
    )

    await expect(
      readRfiQuestionSuggestionMutationError(response, messages, 'Fallback'),
    ).resolves.toBe('Current server conflict')
  })

  it('uses the server message when a conflict has no reason details', async () => {
    const response = jsonResponse({ error: 'Plain conflict' }, 409)

    await expect(
      readRfiQuestionSuggestionMutationError(response, messages, 'Fallback'),
    ).resolves.toBe('Plain conflict')
  })

  it('uses the ordinary response message outside lifecycle conflicts', async () => {
    const response = jsonResponse({ error: 'Validation failed' }, 400)

    await expect(
      readRfiQuestionSuggestionMutationError(response, messages, 'Fallback'),
    ).resolves.toBe('Validation failed')
  })

  it('uses the fallback when neither conflict details nor a message are readable', async () => {
    const response = new Response('{not-json', {
      headers: { 'Content-Type': 'application/json' },
      status: 409,
    })

    await expect(
      readRfiQuestionSuggestionMutationError(response, messages, 'Fallback'),
    ).resolves.toBe('Fallback')
  })
})
