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

  it('allowlists only localizable AI activation blockers', () => {
    const result = toHttpErrorPayload(
      validationError('The candidate profile is blocked', {
        blockers: [
          { code: 'capability_policy_invalid', field: 'imageInput' },
          { code: 'data_policy_missing' },
          { code: 'egress_policy_blocked' },
        ],
        httpStatus: 422,
        providerResponse: 'must remain private',
      }),
      { safeDetails: 'ai_admin_blockers' },
    )

    expect(result).toEqual({
      body: {
        code: 'validation',
        details: {
          blockers: [
            { code: 'capability_policy_invalid', field: 'imageInput' },
            { code: 'data_policy_missing' },
            { code: 'egress_policy_blocked' },
          ],
        },
        error: 'The candidate profile is blocked',
      },
      status: 422,
    })
    expect(JSON.stringify(result)).not.toContain('providerResponse')
    expect(JSON.stringify(result)).not.toContain('must remain private')
  })

  it.each([
    {
      blockers: [{ code: 'provider_secret_leaked', field: 'imageInput' }],
    },
    {
      blockers: [
        { code: 'capability_policy_invalid', field: 'providerSecret' },
      ],
    },
    { blockers: ['capability_policy_invalid'] },
    { blockers: [] },
    {
      blockers: Array.from({ length: 17 }, () => ({
        code: 'connection_inactive',
      })),
    },
  ])('fails closed for malformed AI blocker payload %#', ({ blockers }) => {
    expect(
      toHttpErrorPayload(
        validationError('The candidate profile is blocked', { blockers }),
        { safeDetails: 'ai_admin_blockers' },
      ).body.details,
    ).toBeUndefined()
  })

  it('does not expose AI blockers without an explicit route contract', () => {
    expect(
      toHttpErrorPayload(
        validationError('The candidate profile is blocked', {
          blockers: [{ code: 'connection_inactive' }],
        }),
      ).body.details,
    ).toBeUndefined()
  })

  it('allowlists only bounded AI model dependency details', () => {
    const result = toHttpErrorPayload(
      conflictError('AI model revision is still in use.', {
        profileKeys: ['generation_without_images', 'generation_with_images'],
        providerResponse: 'must remain private',
        runCount: 2,
      }),
      { safeDetails: 'ai_admin_model_dependencies' },
    )

    expect(result).toEqual({
      body: {
        code: 'conflict',
        details: {
          profileKeys: ['generation_without_images', 'generation_with_images'],
          runCount: 2,
        },
        error: 'AI model revision is still in use.',
      },
      status: 409,
    })
    expect(JSON.stringify(result)).not.toContain('providerResponse')
  })

  it.each([
    { profileKeys: ['unknown_profile'], runCount: 0 },
    {
      profileKeys: ['generation_without_images', 'generation_without_images'],
      runCount: 1,
    },
    { profileKeys: [], runCount: 0 },
    { profileKeys: ['generation_without_images'], runCount: -1 },
    { profileKeys: ['generation_without_images'], runCount: 1.5 },
    { profileKeys: 'generation_without_images', runCount: 0 },
  ])('fails closed for malformed AI model dependency details %#', details => {
    expect(
      toHttpErrorPayload(
        conflictError('AI model revision is still in use.', details),
        { safeDetails: 'ai_admin_model_dependencies' },
      ).body.details,
    ).toBeUndefined()
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
    [null, null],
    [{ uniqueId: 42 }, null],
    [
      { uniqueId: 'REQ-001', versions: null },
      { uniqueId: 'REQ-001', versionNumber: null },
    ],
    [
      { uniqueId: 'REQ-001', versions: [{ versionNumber: '2' }] },
      { uniqueId: 'REQ-001', versionNumber: null },
    ],
  ])(
    'sanitizes malformed stale edit summaries %#',
    (latest, expectedLatest) => {
      expect(
        toHttpErrorPayload(
          conflictError('This requirement was updated', {
            latest,
            reason: 'stale_requirement_edit',
          }),
        ).body.details,
      ).toEqual({ latest: expectedLatest, reason: 'stale_requirement_edit' })
    },
  )

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

  it('allowlists safe improvement and privacy conflict details', () => {
    expect(
      toHttpErrorPayload(
        conflictError('Suggestion conflict', {
          reason: 'improvement_suggestion_review_required',
        }),
      ).body.details,
    ).toEqual({ reason: 'improvement_suggestion_review_required' })
    expect(
      toHttpErrorPayload(
        validationError('Privacy conflict', {
          groupKey: 'requirements.owner',
          reason: 'replacement_required',
        }),
      ).body.details,
    ).toEqual({
      groupKey: 'requirements.owner',
      reason: 'replacement_required',
    })
    expect(
      toHttpErrorPayload(
        validationError('Unsafe privacy details', {
          groupKey: 'invalid',
          reason: 'replacement_required',
        }),
      ).body.details,
    ).toBeUndefined()
  })

  it('maps status-bearing unauthorized errors and ignores non-errors', () => {
    expect(
      toHttpErrorPayload(
        Object.assign(new Error('Sign in required'), { status: 401 }),
      ),
    ).toEqual({
      body: { code: 'unauthorized', error: 'Sign in required' },
      status: 401,
    })
    expect(toHttpErrorPayload('not an error')).toEqual({
      body: { code: 'internal', error: 'An internal error occurred' },
      status: 500,
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
