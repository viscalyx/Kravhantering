import { describe, expect, it } from 'vitest'
import { CsrfError } from '@/lib/auth/csrf'
import {
  conflictError,
  internalError,
  validationError,
} from '@/lib/requirements/errors'
import { toHttpErrorPayload } from '@/lib/requirements/service'

describe('toHttpErrorPayload', () => {
  it('maps status-bearing auth errors to handled HTTP payloads', () => {
    const result = toHttpErrorPayload(
      new CsrfError('Cross-origin request rejected.'),
    )

    expect(result).toEqual({
      body: {
        code: 'forbidden',
        error: 'Forbidden',
      },
      status: 403,
    })
  })

  it('omits auth error details from HTTP payloads', () => {
    const result = toHttpErrorPayload(
      Object.assign(new Error('Not allowed'), {
        details: { allowedOrigin: 'https://internal.example' },
        status: 403,
      }),
    )

    expect(result).toEqual({
      body: {
        code: 'forbidden',
        error: 'Forbidden',
      },
      status: 403,
    })
  })

  it('omits arbitrary domain error details from HTTP payloads', () => {
    const result = toHttpErrorPayload(
      validationError('Edit precondition is missing', {
        baseVersionId: 10,
        reason: 'missing_edit_precondition',
      }),
    )

    expect(result).toEqual({
      body: {
        code: 'validation',
        error: 'Edit precondition is missing',
      },
      status: 400,
    })
  })

  it('allowlists only safe stale edit conflict details', () => {
    const result = toHttpErrorPayload(
      conflictError('This requirement was updated', {
        baseVersionId: 10,
        latest: {
          id: 1,
          uniqueId: 'REQ-001',
          versions: [
            {
              id: 22,
              revisionToken: '22222222-2222-4222-8222-222222222222',
              versionNumber: 2,
            },
          ],
        },
        latestVersionId: 22,
        reason: 'stale_requirement_edit',
        requirementId: 1,
      }),
    )

    expect(result).toEqual({
      body: {
        code: 'conflict',
        details: {
          latest: {
            uniqueId: 'REQ-001',
            versionNumber: 2,
          },
          reason: 'stale_requirement_edit',
        },
        error: 'This requirement was updated',
      },
      status: 409,
    })
  })

  it.each([
    'norm_reference_id_exists',
    'norm_reference_id_generation_exhausted',
  ])('allowlists the safe norm-reference conflict reason %s', reason => {
    expect(
      toHttpErrorPayload(
        conflictError('Norm reference ID conflict', {
          reason,
        }),
      ),
    ).toEqual({
      body: {
        code: 'conflict',
        details: { reason },
        error: 'Norm reference ID conflict',
      },
      status: 409,
    })
  })

  it.each([
    'rfi_question_suggestion_review_already_requested',
    'rfi_question_suggestion_review_required',
    'rfi_question_suggestion_already_resolved',
    'rfi_question_suggestion_not_draft',
  ])('allowlists the safe RFI suggestion conflict reason %s', reason => {
    expect(
      toHttpErrorPayload(
        conflictError('RFI question suggestion conflict', {
          content: 'Must remain private',
          reason,
          resolutionMotivation: 'Must also remain private',
          suggestionId: 77,
        }),
      ),
    ).toEqual({
      body: {
        code: 'conflict',
        details: { reason },
        error: 'RFI question suggestion conflict',
      },
      status: 409,
    })
  })

  it('does not allowlist stale edit details on non-conflict errors', () => {
    const result = toHttpErrorPayload(
      validationError('Invalid stale edit payload', {
        latest: { uniqueId: 'REQ-001', versions: [{ versionNumber: 2 }] },
        reason: 'stale_requirement_edit',
      }),
    )

    expect(result).toEqual({
      body: {
        code: 'validation',
        error: 'Invalid stale edit payload',
      },
      status: 400,
    })
  })

  it('allows explicit safe validation status overrides', () => {
    const result = toHttpErrorPayload(
      validationError('Requirement has no published version', {
        httpStatus: 422,
        reason: 'missing_published_version',
        requirementId: 1,
      }),
    )

    expect(result).toEqual({
      body: {
        code: 'validation',
        error: 'Requirement has no published version',
      },
      status: 422,
    })
  })

  it('returns generic payloads for internal and unknown errors', () => {
    expect(
      toHttpErrorPayload(
        internalError('SELECT secret FROM requirements', { sql: 'secret' }),
      ),
    ).toEqual({
      body: {
        code: 'internal',
        error: 'An internal error occurred',
      },
      status: 500,
    })

    expect(toHttpErrorPayload(new Error('SELECT token FROM sessions'))).toEqual(
      {
        body: {
          code: 'internal',
          error: 'An internal error occurred',
        },
        status: 500,
      },
    )
  })
})
