import { AiFinancialRequestError } from './financial-contracts'

export const AI_FINANCIAL_TIMEOUT_MS = 5_000

/** The deadline includes trusted target preparation, before any decryption. */
export async function withAiFinancialDeadline<Result>(
  signal: AbortSignal,
  operation: (signal: AbortSignal) => Promise<Result>,
): Promise<Result> {
  const controller = new AbortController()
  const bounded = AbortSignal.any([signal, controller.signal])
  let rejectAbort!: (reason: unknown) => void
  const aborted = new Promise<never>((_resolve, reject) => {
    rejectAbort = reject
  })
  const abort = (): void =>
    rejectAbort(new AiFinancialRequestError('temporary_error'))
  bounded.addEventListener('abort', abort, { once: true })
  const timeout = setTimeout(() => controller.abort(), AI_FINANCIAL_TIMEOUT_MS)
  try {
    if (bounded.aborted) throw new AiFinancialRequestError('temporary_error')
    return await Promise.race([operation(bounded), aborted])
  } finally {
    clearTimeout(timeout)
    bounded.removeEventListener('abort', abort)
    controller.abort()
  }
}
