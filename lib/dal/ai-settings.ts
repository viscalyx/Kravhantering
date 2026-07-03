import {
  AI_SAFETY_RULE_CACHE_TTL_DEFAULT_SECONDS,
  type AiRequirementGenerationAvailability,
  isValidAiSafetyRuleCacheTtlSeconds,
  isValidMcpMaxRequestBytes,
  MCP_REQUEST_PAYLOAD_DEFAULT_BYTES,
} from '@/lib/ai/generation-availability'
import { isAiRequirementGenerationDisabled } from '@/lib/ai/scan-guard'
import type { SqlServerDatabase } from '@/lib/db'
import { validationError } from '@/lib/requirements/errors'
import { toBoolean } from '@/lib/typeorm/value-mappers'

export interface AiGenerationSettings {
  aiSafetyRuleCacheTtlSeconds: number
  mcpMaxRequestBytes: number
  requirementGenerationEnabled: boolean
}

export type AiGenerationSettingsPatch = Partial<AiGenerationSettings>

interface AiSettingsRow {
  aiSafetyRuleCacheTtlSeconds?: number | string
  mcpMaxRequestBytes?: number | string
  requirementGenerationEnabled: boolean | number | string
}

interface ErrorWithDetails {
  cause?: unknown
  driverError?: unknown
  errors?: unknown
  fallbackError?: unknown
  innerError?: unknown
  message?: unknown
  number?: unknown
  originalError?: unknown
  precedingErrors?: unknown
  primaryError?: unknown
}

interface QueryExecutor {
  query<T = unknown[]>(sql: string, parameters?: unknown[]): Promise<T>
}

interface AiSettingsWriteOptions {
  audit?: (executor: QueryExecutor) => Promise<void>
  env?: NodeJS.ProcessEnv
}

export const DEFAULT_AI_GENERATION_SETTINGS: AiGenerationSettings =
  Object.freeze({
    aiSafetyRuleCacheTtlSeconds: AI_SAFETY_RULE_CACHE_TTL_DEFAULT_SECONDS,
    mcpMaxRequestBytes: MCP_REQUEST_PAYLOAD_DEFAULT_BYTES,
    requirementGenerationEnabled: true,
  })

const MCP_MAX_REQUEST_BYTES_CACHE_TTL_MS = 30_000

let cachedMcpMaxRequestBytes:
  | {
      expiresAt: number
      value: number
    }
  | undefined

export function formatAiSettingsLoadError(
  error: unknown,
): Record<string, unknown> {
  const messages = [...new Set(collectErrorMessages(error))]
  if (error instanceof Error) {
    return {
      message: error.message,
      messages,
      stack: error.stack,
    }
  }

  return {
    message: messages[0] ?? String(error),
    messages,
  }
}

export function resolveAiGenerationAvailability(
  settings: AiGenerationSettings = DEFAULT_AI_GENERATION_SETTINGS,
  env: NodeJS.ProcessEnv = process.env,
): AiRequirementGenerationAvailability {
  const disabledByEnvironment = isAiRequirementGenerationDisabled(env)
  return {
    disabledByEnvironment,
    aiSafetyRuleCacheTtlSeconds: settings.aiSafetyRuleCacheTtlSeconds,
    effectiveRequirementGenerationEnabled:
      settings.requirementGenerationEnabled && !disabledByEnvironment,
    mcpMaxRequestBytes: settings.mcpMaxRequestBytes,
    requirementGenerationEnabled: settings.requirementGenerationEnabled,
  }
}

function readMcpMaxRequestBytes(value: unknown): number {
  const numeric = Number(value ?? MCP_REQUEST_PAYLOAD_DEFAULT_BYTES)
  return isValidMcpMaxRequestBytes(numeric)
    ? numeric
    : MCP_REQUEST_PAYLOAD_DEFAULT_BYTES
}

function readAiSafetyRuleCacheTtlSeconds(value: unknown): number {
  const numeric = Number(value ?? AI_SAFETY_RULE_CACHE_TTL_DEFAULT_SECONDS)
  return isValidAiSafetyRuleCacheTtlSeconds(numeric)
    ? numeric
    : AI_SAFETY_RULE_CACHE_TTL_DEFAULT_SECONDS
}

function assertMcpMaxRequestBytes(value: number): void {
  if (!isValidMcpMaxRequestBytes(value)) {
    throw validationError('Invalid AI settings', {
      reason: 'invalid_mcp_max_request_bytes',
    })
  }
}

function assertAiSafetyRuleCacheTtlSeconds(value: number): void {
  if (!isValidAiSafetyRuleCacheTtlSeconds(value)) {
    throw validationError('Invalid AI settings', {
      reason: 'invalid_ai_safety_rule_cache_ttl_seconds',
    })
  }
}

function cacheMcpMaxRequestBytes(value: number): void {
  cachedMcpMaxRequestBytes = {
    expiresAt: Date.now() + MCP_MAX_REQUEST_BYTES_CACHE_TTL_MS,
    value,
  }
}

function collectErrorMessages(
  error: unknown,
  seen = new Set<unknown>(),
): string[] {
  if (error === null || error === undefined || seen.has(error)) {
    return []
  }
  seen.add(error)

  if (typeof error === 'string') {
    return [error]
  }

  if (error instanceof Error) {
    const details = error as ErrorWithDetails
    return [
      error.message,
      typeof details.number === 'number' ? String(details.number) : '',
      ...collectErrorMessages(error.cause, seen),
      ...collectErrorMessages(details.driverError, seen),
      ...collectErrorMessages(details.errors, seen),
      ...collectErrorMessages(details.fallbackError, seen),
      ...collectErrorMessages(details.innerError, seen),
      ...collectErrorMessages(details.originalError, seen),
      ...collectErrorMessages(details.precedingErrors, seen),
      ...collectErrorMessages(details.primaryError, seen),
    ].filter(Boolean)
  }

  if (Array.isArray(error)) {
    return error.flatMap(item => collectErrorMessages(item, seen))
  }

  if (typeof error === 'object') {
    const details = error as ErrorWithDetails
    return [
      typeof details.message === 'string' ? details.message : '',
      typeof details.number === 'number' ? String(details.number) : '',
      ...collectErrorMessages(details.cause, seen),
      ...collectErrorMessages(details.driverError, seen),
      ...collectErrorMessages(details.errors, seen),
      ...collectErrorMessages(details.fallbackError, seen),
      ...collectErrorMessages(details.innerError, seen),
      ...collectErrorMessages(details.originalError, seen),
      ...collectErrorMessages(details.precedingErrors, seen),
      ...collectErrorMessages(details.primaryError, seen),
    ].filter(Boolean)
  }

  return []
}

function isExpectedLegacyAiSettingsReadError(error: unknown): boolean {
  const joinedMessages = collectErrorMessages(error).join(' ')
  return (
    /\b207\b/.test(joinedMessages) &&
    /(?:mcp_max_request_bytes|ai_safety_rule_cache_ttl_seconds)/i.test(
      joinedMessages,
    )
  )
}

function isExpectedMissingAiSettingsColumnError(
  error: unknown,
  columnName: string,
): boolean {
  const joinedMessages = collectErrorMessages(error).join(' ')
  return (
    /\b207\b/.test(joinedMessages) &&
    joinedMessages.toLowerCase().includes(columnName.toLowerCase())
  )
}

function warnUnexpectedAiSettingsFallback(error: unknown): void {
  console.warn(
    'AI settings current projection failed; falling back to legacy settings.',
    { error: formatAiSettingsLoadError(error) },
  )
}

async function getLegacyAiGenerationSettings(
  db: SqlServerDatabase,
): Promise<AiGenerationSettings> {
  const rows = (await db.query(`
    SELECT TOP (1)
      requirement_generation_enabled AS requirementGenerationEnabled
    FROM ai_settings
    WHERE id = 1
  `)) as AiSettingsRow[]

  const row = rows[0]
  if (!row) {
    return DEFAULT_AI_GENERATION_SETTINGS
  }

  return {
    aiSafetyRuleCacheTtlSeconds: AI_SAFETY_RULE_CACHE_TTL_DEFAULT_SECONDS,
    mcpMaxRequestBytes: MCP_REQUEST_PAYLOAD_DEFAULT_BYTES,
    requirementGenerationEnabled: toBoolean(row.requirementGenerationEnabled),
  }
}

async function getAiGenerationSettingsWithoutCacheTtl(
  db: SqlServerDatabase,
): Promise<AiGenerationSettings> {
  const rows = (await db.query(`
    SELECT TOP (1)
      mcp_max_request_bytes AS mcpMaxRequestBytes,
      requirement_generation_enabled AS requirementGenerationEnabled
    FROM ai_settings
    WHERE id = 1
  `)) as AiSettingsRow[]

  const row = rows[0]
  if (!row) {
    return DEFAULT_AI_GENERATION_SETTINGS
  }

  return {
    aiSafetyRuleCacheTtlSeconds: AI_SAFETY_RULE_CACHE_TTL_DEFAULT_SECONDS,
    mcpMaxRequestBytes: readMcpMaxRequestBytes(row.mcpMaxRequestBytes),
    requirementGenerationEnabled: toBoolean(row.requirementGenerationEnabled),
  }
}

export function clearMcpMaxRequestBytesCacheForTests(): void {
  cachedMcpMaxRequestBytes = undefined
}

export async function getCachedMcpMaxRequestBytes(
  db: SqlServerDatabase,
): Promise<number> {
  if (
    cachedMcpMaxRequestBytes &&
    cachedMcpMaxRequestBytes.expiresAt > Date.now()
  ) {
    return cachedMcpMaxRequestBytes.value
  }

  try {
    const settings = await getAiGenerationSettings(db)
    cacheMcpMaxRequestBytes(settings.mcpMaxRequestBytes)
    return settings.mcpMaxRequestBytes
  } catch {
    cacheMcpMaxRequestBytes(MCP_REQUEST_PAYLOAD_DEFAULT_BYTES)
    return MCP_REQUEST_PAYLOAD_DEFAULT_BYTES
  }
}

export async function getAiGenerationSettings(
  db: SqlServerDatabase,
): Promise<AiGenerationSettings> {
  try {
    const rows = (await db.query(`
      SELECT TOP (1)
        ai_safety_rule_cache_ttl_seconds AS aiSafetyRuleCacheTtlSeconds,
        mcp_max_request_bytes AS mcpMaxRequestBytes,
        requirement_generation_enabled AS requirementGenerationEnabled
      FROM ai_settings
      WHERE id = 1
    `)) as AiSettingsRow[]

    const row = rows[0]
    if (!row) {
      return DEFAULT_AI_GENERATION_SETTINGS
    }

    return {
      aiSafetyRuleCacheTtlSeconds: readAiSafetyRuleCacheTtlSeconds(
        row.aiSafetyRuleCacheTtlSeconds,
      ),
      mcpMaxRequestBytes: readMcpMaxRequestBytes(row.mcpMaxRequestBytes),
      requirementGenerationEnabled: toBoolean(row.requirementGenerationEnabled),
    }
  } catch (error) {
    if (!isExpectedLegacyAiSettingsReadError(error)) {
      warnUnexpectedAiSettingsFallback(error)
    }
    try {
      return isExpectedMissingAiSettingsColumnError(
        error,
        'ai_safety_rule_cache_ttl_seconds',
      )
        ? await getAiGenerationSettingsWithoutCacheTtl(db)
        : await getLegacyAiGenerationSettings(db)
    } catch (fallbackError) {
      try {
        return await getLegacyAiGenerationSettings(db)
      } catch (legacyFallbackError) {
        throw Object.assign(
          new Error('Failed to load AI settings from the database.', {
            cause: error,
          }),
          { fallbackError, legacyFallbackError },
        )
      }
    }
  }
}

export async function getAiGenerationAvailability(
  db: SqlServerDatabase,
  env: NodeJS.ProcessEnv = process.env,
): Promise<AiRequirementGenerationAvailability> {
  return resolveAiGenerationAvailability(await getAiGenerationSettings(db), env)
}

export async function updateAiGenerationSettings(
  db: SqlServerDatabase,
  values: AiGenerationSettings,
  options: AiSettingsWriteOptions = {},
): Promise<AiRequirementGenerationAvailability> {
  assertMcpMaxRequestBytes(values.mcpMaxRequestBytes)
  assertAiSafetyRuleCacheTtlSeconds(values.aiSafetyRuleCacheTtlSeconds)
  const now = new Date().toISOString()

  await db.transaction(async manager => {
    await manager.query(
      `
        UPDATE ai_settings
        SET
          ai_safety_rule_cache_ttl_seconds = @0,
          mcp_max_request_bytes = @1,
          requirement_generation_enabled = @2,
          updated_at = @3
        WHERE id = 1;

        IF @@ROWCOUNT = 0
        BEGIN
          SET IDENTITY_INSERT ai_settings ON;

          INSERT INTO ai_settings (
            id,
            ai_safety_rule_cache_ttl_seconds,
            mcp_max_request_bytes,
            requirement_generation_enabled,
            created_at,
            updated_at
          )
          VALUES (1, @0, @1, @2, @3, @3);

          SET IDENTITY_INSERT ai_settings OFF;
        END
      `,
      [
        values.aiSafetyRuleCacheTtlSeconds,
        values.mcpMaxRequestBytes,
        values.requirementGenerationEnabled,
        now,
      ],
    )
    await options.audit?.(manager)
  })

  cacheMcpMaxRequestBytes(values.mcpMaxRequestBytes)
  return resolveAiGenerationAvailability(values, options.env)
}

export async function patchAiGenerationSettings(
  db: SqlServerDatabase,
  patch: AiGenerationSettingsPatch,
  options: AiSettingsWriteOptions = {},
): Promise<AiRequirementGenerationAvailability> {
  const current = await getAiGenerationSettings(db)
  return updateAiGenerationSettings(
    db,
    {
      ...current,
      ...patch,
    },
    options,
  )
}
