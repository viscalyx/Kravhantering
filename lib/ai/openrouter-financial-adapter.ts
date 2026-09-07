import type {
  AiAdminAdapterContext,
  AiAdminConnectionAdapter,
} from './admin-adapter'
import {
  AI_FINANCIAL_FIELDS,
  type AiFinancialMeasurement,
  type AiFinancialOperation,
  AiFinancialRequestError,
  type AiFinancialSnapshot,
} from './financial-contracts'

import { AI_FINANCIAL_TIMEOUT_MS } from './financial-deadline'
export const AI_FINANCIAL_MAX_RESPONSE_BYTES = 32_768

async function readJson(
  response: Response,
  signal: AbortSignal,
): Promise<Record<string, unknown>> {
  const reader = response.body?.getReader()
  const cancel = (): void => {
    void reader?.cancel().catch(() => undefined)
  }
  signal.addEventListener('abort', cancel, { once: true })
  try {
    if (!response.ok) {
      throw new AiFinancialRequestError(
        response.status === 401 || response.status === 403
          ? 'invalid_credential'
          : 'temporary_error',
      )
    }
    if (
      !reader ||
      Number(response.headers.get('content-length') ?? 0) >
        AI_FINANCIAL_MAX_RESPONSE_BYTES
    ) {
      throw new AiFinancialRequestError('temporary_error')
    }
    const chunks: Uint8Array[] = []
    let length = 0
    while (true) {
      signal.throwIfAborted()
      const { done, value } = await reader.read()
      if (done) break
      length += value.byteLength
      if (length > AI_FINANCIAL_MAX_RESPONSE_BYTES)
        throw new AiFinancialRequestError('temporary_error')
      chunks.push(value)
    }
    signal.throwIfAborted()
    const parsed: unknown = JSON.parse(
      new TextDecoder('utf8', { fatal: true }).decode(Buffer.concat(chunks)),
    )
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !('data' in parsed) ||
      typeof parsed.data !== 'object' ||
      parsed.data === null ||
      Array.isArray(parsed.data)
    ) {
      throw new AiFinancialRequestError('temporary_error')
    }
    return parsed.data as Record<string, unknown>
  } finally {
    signal.removeEventListener('abort', cancel)
    void reader?.cancel().catch(() => undefined)
    reader?.releaseLock()
  }
}

function amount(value: unknown): string | null {
  if (value === undefined || value === null) return null
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    Math.abs(value) >= 1e15
  ) {
    throw new AiFinancialRequestError('temporary_error')
  }
  return value.toFixed(12).replace(/\.?0+$/u, '') || '0'
}

function measurement(
  field: AiFinancialMeasurement['field'],
  value: unknown,
  period: AiFinancialMeasurement['period'] = 'lifetime',
  unlimited = false,
): AiFinancialMeasurement {
  const normalized = amount(value)
  return {
    field,
    period,
    currency: 'USD',
    amount: normalized,
    state:
      normalized !== null
        ? 'available'
        : unlimited && value === null
          ? 'unlimited'
          : 'unavailable',
  }
}

function normalize(
  data: Record<string, unknown>,
  operation: Readonly<AiFinancialOperation>,
): AiFinancialSnapshot {
  const measurements: AiFinancialMeasurement[] = []
  if (operation.id === 'account_credits') {
    const credits = measurement('purchased_credits', data.total_credits)
    const usage = measurement('usage', data.total_usage)
    if (credits.amount === null || usage.amount === null)
      throw new AiFinancialRequestError('temporary_error')
    measurements.push(
      credits,
      usage,
      measurement(
        'credit_balance',
        Number(credits.amount) - Number(usage.amount),
      ),
    )
  } else {
    if (data.is_management_key === true || data.is_provisioning_key === true) {
      throw new AiFinancialRequestError('invalid_credential')
    }
    const period =
      data.limit_reset === null
        ? 'lifetime'
        : data.limit_reset === 'daily' ||
            data.limit_reset === 'weekly' ||
            data.limit_reset === 'monthly'
          ? data.limit_reset
          : 'unknown'
    measurements.push(
      measurement('usage', data.usage),
      measurement('spending_limit', data.limit, period, true),
      measurement(
        'remaining_allowance',
        data.limit_remaining,
        period,
        data.limit === null,
      ),
    )
    for (const period of ['daily', 'weekly', 'monthly'] as const) {
      measurements.push(measurement('usage', data[`usage_${period}`], period))
    }
    if (measurements.every(item => item.state === 'unavailable'))
      throw new AiFinancialRequestError('temporary_error')
  }
  for (const field of AI_FINANCIAL_FIELDS) {
    if (!operation.fields.includes(field))
      measurements.push({
        field,
        period: 'unknown',
        currency: 'USD',
        amount: null,
        state: 'unsupported',
      })
  }
  return { scope: operation.scope, measurements }
}

async function fetchStatus(
  context: Readonly<AiAdminAdapterContext>,
  operation: Readonly<AiFinancialOperation>,
  signal: AbortSignal,
): Promise<AiFinancialSnapshot> {
  const known = openRouterFinancialAdapter.capabilities.operations.find(
    item => item.id === operation.id,
  )
  if (
    !known ||
    known.credentialPurpose !== operation.credentialPurpose ||
    known.scope !== operation.scope
  ) {
    throw new AiFinancialRequestError('unsupported')
  }
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
  const request = async (): Promise<AiFinancialSnapshot> => {
    bounded.throwIfAborted()
    const url = new URL(context.connection.endpointUrl)
    url.pathname = `${url.pathname.replace(/\/$/u, '')}/${known.id === 'account_credits' ? 'credits' : 'key'}`
    const response = await context.egress.fetch(url.toString(), {
      responseByteLimit: AI_FINANCIAL_MAX_RESPONSE_BYTES,
      method: 'GET',
      redirect: 'error',
      signal: bounded,
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${context.credential ?? ''}`,
      },
    })
    return normalize(await readJson(response, bounded), known)
  }
  try {
    return await Promise.race([request(), aborted])
  } catch (error) {
    throw error instanceof AiFinancialRequestError
      ? error
      : new AiFinancialRequestError('temporary_error')
  } finally {
    clearTimeout(timeout)
    bounded.removeEventListener('abort', abort)
    controller.abort()
  }
}

export const openRouterFinancialAdapter: NonNullable<
  AiAdminConnectionAdapter['financial']
> = {
  capabilities: {
    support: 'partial',
    operations: [
      {
        id: 'account_credits',
        scope: 'account',
        credentialPurpose: 'management',
        fields: ['purchased_credits', 'usage', 'credit_balance'],
      },
      {
        id: 'current_credential',
        scope: 'credential',
        credentialPurpose: 'runtime',
        fields: ['usage', 'spending_limit', 'remaining_allowance'],
      },
    ],
  },
  fetch: fetchStatus,
}
