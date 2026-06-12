import { isHsaId } from '@/lib/auth/hsa-id'
import {
  conflictError,
  isRequirementsServiceError,
  serviceUnavailableError,
  validationError,
} from '@/lib/requirements/errors'
import type { RequirementResponsibilityPersonRecord } from '@/lib/requirements/responsibility-person'

const DEFAULT_TIMEOUT_MS = 5000
const LOOKUP_REASON = {
  conflict: 'hsa_lookup_conflict',
  invalidResponse: 'hsa_lookup_invalid_response',
  missingConfig: 'hsa_lookup_missing_config',
  notFound: 'hsa_lookup_not_found',
  timeout: 'hsa_lookup_timeout',
  unavailable: 'hsa_lookup_unavailable',
} as const

export interface HsaPersonLookupConfig {
  timeoutMs: number
  url: string
}

interface LookupOptions {
  config?: HsaPersonLookupConfig
  fetchImpl?: typeof fetch
}

function parseTimeout(value: string | undefined): number {
  if (!value) return DEFAULT_TIMEOUT_MS
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_TIMEOUT_MS
  return Math.min(Math.trunc(parsed), 30_000)
}

export function getHsaPersonLookupConfig(
  env: NodeJS.ProcessEnv = process.env,
): HsaPersonLookupConfig | null {
  const url = env.HSA_PERSON_LOOKUP_URL?.trim()
  if (!url) return null
  return {
    timeoutMs: parseTimeout(env.HSA_PERSON_LOOKUP_TIMEOUT_MS),
    url,
  }
}

function stringField(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function nullableStringField(value: unknown): string | null {
  return value == null ? null : stringField(value)
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text()
  if (!text.trim()) return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function normalizePayload(
  payload: unknown,
  requestedHsaId: string,
): RequirementResponsibilityPersonRecord {
  if (!payload || typeof payload !== 'object') {
    throw serviceUnavailableError('HSA lookup returned an invalid response', {
      reason: LOOKUP_REASON.invalidResponse,
    })
  }

  const data = payload as Record<string, unknown>
  const hsaId = stringField(data.hsaId)
  const givenName = stringField(data.givenName)
  if (!hsaId || !givenName) {
    throw serviceUnavailableError('HSA lookup returned an invalid response', {
      reason: LOOKUP_REASON.invalidResponse,
    })
  }
  if (hsaId !== requestedHsaId) {
    throw conflictError('HSA lookup returned a different identity', {
      reason: LOOKUP_REASON.conflict,
    })
  }

  return {
    email: nullableStringField(data.email),
    givenName,
    hsaId,
    middleName: nullableStringField(data.middleName),
    surname: nullableStringField(data.surname),
  }
}

function mapLookupHttpError(status: number, payload: unknown): never {
  const code =
    payload && typeof payload === 'object'
      ? stringField((payload as Record<string, unknown>).code)
      : null
  if (code === 'not_found') {
    throw validationError('HSA-id was not found in the HSA directory', {
      reason: LOOKUP_REASON.notFound,
    })
  }
  if (status === 409 || code === 'conflict') {
    throw conflictError('HSA lookup returned conflicting person records', {
      reason: LOOKUP_REASON.conflict,
    })
  }
  throw serviceUnavailableError('HSA lookup service is unavailable', {
    reason: LOOKUP_REASON.unavailable,
  })
}

export async function lookupHsaPerson(
  hsaId: string,
  options: LookupOptions = {},
): Promise<RequirementResponsibilityPersonRecord> {
  if (!isHsaId(hsaId)) {
    throw validationError('Invalid HSA-id format', {
      reason: 'invalid_hsa_id',
    })
  }

  const config = options.config ?? getHsaPersonLookupConfig()
  if (!config) {
    throw serviceUnavailableError('HSA lookup URL is not configured', {
      reason: LOOKUP_REASON.missingConfig,
    })
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs)
  try {
    const response = await (options.fetchImpl ?? fetch)(config.url, {
      body: JSON.stringify({ hsaId }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
      signal: controller.signal,
    })
    const payload = await readJson(response)
    if (!response.ok) {
      mapLookupHttpError(response.status, payload)
    }
    return normalizePayload(payload, hsaId)
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw serviceUnavailableError('HSA lookup service timed out', {
        reason: LOOKUP_REASON.timeout,
      })
    }
    if (isRequirementsServiceError(error)) {
      throw error
    }
    throw serviceUnavailableError('HSA lookup service is unavailable', {
      reason: LOOKUP_REASON.unavailable,
    })
  } finally {
    clearTimeout(timeout)
  }
}
