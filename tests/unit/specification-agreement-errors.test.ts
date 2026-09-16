import { describe, expect, it } from 'vitest'
import { conflictError } from '@/lib/requirements/errors'
import { toHttpErrorPayload } from '@/lib/requirements/http-errors'
import { agreementErrorMessage } from '@/lib/specifications/agreement-errors'

describe('agreement mutation error messages', () => {
  const translate = (key: string) => `agreement.${key}`

  it.each([
    ['removal_requires_included', 'removalRequiresIncluded'],
    ['deviation_date_invalid', 'deviationDateError'],
    ['deviation_renewal_pending', 'renewalPendingError'],
    ['deviation_renewal_target', 'renewalTargetError'],
    ['deviation_approval_closed', 'closedApprovalError'],
    ['deviation_superseded', 'renewalTargetError'],
  ])('maps %s to actionable guidance', (reason, key) => {
    expect(
      agreementErrorMessage(
        { code: 'conflict', details: { reason } },
        translate,
      ),
    ).toBe(`agreement.${key}`)
  })

  it.each([
    ['forbidden', 'permissionChangedError'],
    ['not_found', 'contentChangedError'],
    ['conflict', 'contentChangedError'],
    ['validation', 'invalidInputError'],
    ['internal', 'saveFailed'],
  ])(
    'uses the public %s error category when the reason is unknown',
    (code, key) => {
      expect(
        agreementErrorMessage(
          { code, details: { reason: 'Internal database message' } },
          translate,
        ),
      ).toBe(`agreement.${key}`)
    },
  )

  it('preserves the safe removal reason without exposing internal details', () => {
    expect(
      toHttpErrorPayload(
        conflictError('Included required', {
          reason: 'removal_requires_included',
          internal: 'private context',
        }),
      ),
    ).toEqual({
      status: 409,
      body: {
        code: 'conflict',
        error: 'Included required',
        details: { reason: 'removal_requires_included' },
      },
    })
  })

  it('uses translated fallback text for an empty response', () => {
    expect(agreementErrorMessage({}, translate, 'retryFailed')).toBe(
      'agreement.retryFailed',
    )
  })
})
