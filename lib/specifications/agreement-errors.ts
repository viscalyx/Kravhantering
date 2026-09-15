const reasonKeys = {
  active_deviation_exists: 'activeDeviationError',
  specification_content_locked: 'contentLockedError',
  active_deviations: 'pendingDeviationWarning',
  deviation_cancellation_required: 'pendingDeviationWarning',
  binding_reserved: 'reservedContentError',
  approved_deviations: 'responsibleEndingRequired',
  pending_agreement: 'pendingAgreementError',
  agreement_date_passed: 'expiredDraftWarning',
  activation_confirmation_required: 'immediateWarning',
  agreement_identity_conflict: 'duplicateAgreementError',
  agreement_date_locked: 'lockedDateError',
  agreement_date_invalid: 'invalidDateError',
  agreement_date_order: 'dateOrderError',
  agreement_end_date_invalid: 'endDateError',
} as const

export interface AgreementHttpError {
  code?: string
  details?: { reason?: string }
}

/** Translate stable public conflict reasons; never display server text as UI copy. */
export function agreementErrorMessage(
  payload: AgreementHttpError,
  translate: (key: string) => string,
  fallback = 'saveFailed',
): string {
  const reason = payload.details?.reason
  if (reason && Object.hasOwn(reasonKeys, reason))
    return translate(reasonKeys[reason as keyof typeof reasonKeys])
  if (payload.code === 'forbidden') return translate('permissionChangedError')
  if (payload.code === 'not_found') return translate('contentChangedError')
  if (payload.code === 'conflict') return translate('contentChangedError')
  if (payload.code === 'validation') return translate('invalidInputError')
  return translate(fallback)
}
