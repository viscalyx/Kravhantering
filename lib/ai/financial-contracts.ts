import { z } from 'zod'

export const aiCredentialPurposeSchema = z.enum(['runtime', 'management'])
export type AiCredentialPurpose = z.infer<typeof aiCredentialPurposeSchema>

export const AI_FINANCIAL_FIELDS = [
  'purchased_credits',
  'usage',
  'credit_balance',
  'spending_limit',
  'remaining_allowance',
] as const
const fieldSchema = z.enum(AI_FINANCIAL_FIELDS)
const scopeSchema = z.enum(['account', 'organization', 'credential'])
const periodSchema = z.enum([
  'lifetime',
  'daily',
  'weekly',
  'monthly',
  'unknown',
])

export const aiFinancialOperationSchema = z
  .object({
    id: z.string().regex(/^[a-z_]{1,64}$/u),
    scope: scopeSchema,
    credentialPurpose: aiCredentialPurposeSchema.nullable(),
    fields: z.array(fieldSchema).min(1).max(5),
  })
  .strict()

export const aiFinancialCapabilitiesSchema = z
  .object({
    support: z.enum(['none', 'partial', 'full']),
    operations: z.array(aiFinancialOperationSchema).max(8),
  })
  .strict()

export type AiFinancialOperation = z.infer<typeof aiFinancialOperationSchema>
export type AiFinancialCapabilities = z.infer<
  typeof aiFinancialCapabilitiesSchema
>
export const AI_FINANCIAL_UNSUPPORTED: AiFinancialCapabilities = {
  support: 'none',
  operations: [],
}

export const aiFinancialMeasurementSchema = z
  .object({
    field: fieldSchema,
    period: periodSchema,
    state: z.enum(['available', 'unlimited', 'unavailable', 'unsupported']),
    amount: z
      .string()
      .regex(/^-?(?:0|[1-9]\d{0,14})(?:\.\d{1,12})?$/u)
      .nullable(),
    currency: z.string().regex(/^[A-Z]{3}$/u),
  })
  .strict()
  .refine(value => (value.state === 'available') === (value.amount !== null))

export const aiFinancialSnapshotSchema = z
  .object({
    scope: scopeSchema,
    measurements: z.array(aiFinancialMeasurementSchema).min(1).max(20),
  })
  .strict()
export type AiFinancialSnapshot = z.infer<typeof aiFinancialSnapshotSchema>
export type AiFinancialMeasurement = z.infer<
  typeof aiFinancialMeasurementSchema
>

export type AiFinancialError =
  | 'invalid_credential'
  | 'temporary_error'
  | 'unsupported'
export class AiFinancialRequestError extends Error {
  constructor(readonly code: AiFinancialError) {
    super('The provider financial request could not be completed.')
    this.name = 'AiFinancialRequestError'
  }
}

export interface AiFinancialResult {
  // Opaque application binding, never a provider key identifier.
  binding: string | null
  lastSuccessfulAt: string | null
  operation: AiFinancialOperation
  refreshError?: AiFinancialError
  snapshot: AiFinancialSnapshot | null
  state: 'success' | 'stale' | 'missing_credential' | AiFinancialError
}

export interface AiManagementCredentialMetadata {
  active: { id: string; verifiedAt: string } | null
  candidates: readonly { id: string; createdAt: string }[]
}

export interface AiConnectionFinancialStatus {
  capabilities: AiFinancialCapabilities
  managementCredential: AiManagementCredentialMetadata
  results: readonly AiFinancialResult[]
}

/** Retain values only when a fresh server response confirms the same binding. */
export function retainAiFinancialSnapshots(
  previous: AiConnectionFinancialStatus | null,
  current: AiConnectionFinancialStatus,
): AiConnectionFinancialStatus {
  return {
    ...current,
    results: current.results.map(result => {
      const old = previous?.results.find(
        value =>
          value.operation.id === result.operation.id &&
          value.operation.scope === result.operation.scope &&
          value.binding === result.binding,
      )
      return (result.state === 'temporary_error' ||
        result.state === 'invalid_credential') &&
        result.binding &&
        old?.snapshot
        ? {
            ...result,
            state: 'stale',
            refreshError: result.state,
            snapshot: old.snapshot,
            lastSuccessfulAt: old.lastSuccessfulAt,
          }
        : result
    }),
  }
}
