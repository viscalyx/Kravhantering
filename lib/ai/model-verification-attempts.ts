export type AiModelVerificationAttemptErrorCode =
  | 'attempt_capacity'
  | 'attempt_payload_invalid'
  | 'attempt_expired'
  | 'attempt_mismatch'
  | 'attempt_unavailable'

export class AiModelVerificationAttemptError extends Error {
  readonly code: AiModelVerificationAttemptErrorCode

  constructor(code: AiModelVerificationAttemptErrorCode) {
    super(code)
    this.name = 'AiModelVerificationAttemptError'
    this.code = code
  }
}

export interface AiModelVerificationAttempt<TResult = unknown> {
  connectionId: string
  expiresAt: string
  fingerprint: string
  id: string
  result: TResult
}

/** Consume must run inside the transaction that saves the model and its evidence. */
export interface AiModelVerificationAttemptStore<TResult, TTransaction> {
  consume(
    input: {
      connectionId: string
      attemptId: string
      fingerprint: string
    },
    transaction: TTransaction,
  ): Promise<Readonly<AiModelVerificationAttempt<TResult>>>
  create(input: {
    connectionId: string
    fingerprint: string
    result: TResult
  }): Promise<Readonly<AiModelVerificationAttempt<TResult>>>
  discard(input: { connectionId: string; attemptId: string }): Promise<void>
  list(
    connectionId: string,
  ): Promise<readonly Readonly<AiModelVerificationAttempt<TResult>>[]>
}
