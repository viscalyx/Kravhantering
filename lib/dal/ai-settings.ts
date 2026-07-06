import {
  ADMIN_AI_SETTINGS_CONSTRAINTS,
  type AdminAiSettings,
  AI_SAFETY_RULE_CACHE_TTL_DEFAULT_SECONDS,
  type AiRequirementGenerationAvailability,
  isValidAiSafetyRuleCacheTtlSeconds,
  isValidMcpImportMaxRows,
  isValidMcpImportValidationTtlMinutes,
  isValidMcpMaxRequestBytes,
  MCP_IMPORT_MAX_ROWS_DEFAULT,
  MCP_IMPORT_VALIDATION_TTL_DEFAULT_MINUTES,
  MCP_REQUEST_PAYLOAD_DEFAULT_BYTES,
} from '@/lib/ai/generation-availability'
import { isAiRequirementGenerationDisabled } from '@/lib/ai/scan-guard'
import type { SqlServerDatabase } from '@/lib/db'
import { validationError } from '@/lib/requirements/errors'
import { toBoolean } from '@/lib/typeorm/value-mappers'

export interface AiGenerationSettings {
  aiSafetyForensicLoggingEnabled: boolean
  aiSafetyRuleCacheTtlSeconds: number
  mcpImportMaxRows: number
  mcpImportValidationTtlMinutes: number
  mcpMaxRequestBytes: number
  requirementGenerationEnabled: boolean
}

export type AiGenerationSettingsPatch = Partial<AiGenerationSettings>

export interface McpRuntimeSettings {
  mcpImportMaxRows: number
  mcpImportValidationTtlMinutes: number
  mcpMaxRequestBytes: number
}

export interface AiSafetyRuntimeSettings {
  aiSafetyForensicLoggingEnabled: boolean
}

interface AiSettingsRow {
  aiSafetyForensicLoggingEnabled?: boolean | number | string
  aiSafetyRuleCacheTtlSeconds?: number | string
  mcpImportMaxRows?: number | string
  mcpImportValidationTtlMinutes?: number | string
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
    aiSafetyForensicLoggingEnabled: true,
    aiSafetyRuleCacheTtlSeconds: AI_SAFETY_RULE_CACHE_TTL_DEFAULT_SECONDS,
    mcpImportMaxRows: MCP_IMPORT_MAX_ROWS_DEFAULT,
    mcpImportValidationTtlMinutes: MCP_IMPORT_VALIDATION_TTL_DEFAULT_MINUTES,
    mcpMaxRequestBytes: MCP_REQUEST_PAYLOAD_DEFAULT_BYTES,
    requirementGenerationEnabled: true,
  })

const DEFAULT_MCP_RUNTIME_SETTINGS: McpRuntimeSettings = Object.freeze({
  mcpImportMaxRows: MCP_IMPORT_MAX_ROWS_DEFAULT,
  mcpImportValidationTtlMinutes: MCP_IMPORT_VALIDATION_TTL_DEFAULT_MINUTES,
  mcpMaxRequestBytes: MCP_REQUEST_PAYLOAD_DEFAULT_BYTES,
})

const DEFAULT_AI_SAFETY_RUNTIME_SETTINGS: AiSafetyRuntimeSettings =
  Object.freeze({
    aiSafetyForensicLoggingEnabled: true,
  })

const MCP_RUNTIME_SETTINGS_CACHE_TTL_MS = 30_000
const AI_SAFETY_RUNTIME_SETTINGS_CACHE_TTL_MS = 30_000

let cachedMcpRuntimeSettings:
  | {
      expiresAt: number
      value: McpRuntimeSettings
    }
  | undefined

let cachedAiSafetyRuntimeSettings:
  | {
      expiresAt: number
      value: AiSafetyRuntimeSettings
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
    effectiveRequirementGenerationEnabled:
      settings.requirementGenerationEnabled && !disabledByEnvironment,
  }
}

function readMcpMaxRequestBytes(value: unknown): number {
  const numeric = Number(value ?? MCP_REQUEST_PAYLOAD_DEFAULT_BYTES)
  return isValidMcpMaxRequestBytes(numeric)
    ? numeric
    : MCP_REQUEST_PAYLOAD_DEFAULT_BYTES
}

function readMcpImportMaxRows(value: unknown): number {
  const numeric = Number(value ?? MCP_IMPORT_MAX_ROWS_DEFAULT)
  return isValidMcpImportMaxRows(numeric)
    ? numeric
    : MCP_IMPORT_MAX_ROWS_DEFAULT
}

function readMcpImportValidationTtlMinutes(value: unknown): number {
  const numeric = Number(value ?? MCP_IMPORT_VALIDATION_TTL_DEFAULT_MINUTES)
  return isValidMcpImportValidationTtlMinutes(numeric)
    ? numeric
    : MCP_IMPORT_VALIDATION_TTL_DEFAULT_MINUTES
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

function assertMcpImportMaxRows(value: number): void {
  if (!isValidMcpImportMaxRows(value)) {
    throw validationError('Invalid AI settings', {
      reason: 'invalid_mcp_import_max_rows',
    })
  }
}

function assertMcpImportValidationTtlMinutes(value: number): void {
  if (!isValidMcpImportValidationTtlMinutes(value)) {
    throw validationError('Invalid AI settings', {
      reason: 'invalid_mcp_import_validation_ttl_minutes',
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

function assertMcpRuntimeSettings(values: McpRuntimeSettings): void {
  assertMcpMaxRequestBytes(values.mcpMaxRequestBytes)
  assertMcpImportMaxRows(values.mcpImportMaxRows)
  assertMcpImportValidationTtlMinutes(values.mcpImportValidationTtlMinutes)
}

function cacheMcpRuntimeSettings(value: McpRuntimeSettings): void {
  cachedMcpRuntimeSettings = {
    expiresAt: Date.now() + MCP_RUNTIME_SETTINGS_CACHE_TTL_MS,
    value,
  }
}

function cacheAiSafetyRuntimeSettings(value: AiSafetyRuntimeSettings): void {
  cachedAiSafetyRuntimeSettings = {
    expiresAt: Date.now() + AI_SAFETY_RUNTIME_SETTINGS_CACHE_TTL_MS,
    value,
  }
}

function adminAiSettingsFromSettings(
  settings: AiGenerationSettings,
  env: NodeJS.ProcessEnv = process.env,
): AdminAiSettings {
  const disabledByEnvironment = isAiRequirementGenerationDisabled(env)
  return {
    aiSafetyForensicLoggingEnabled: settings.aiSafetyForensicLoggingEnabled,
    aiSafetyRuleCacheTtlSeconds: settings.aiSafetyRuleCacheTtlSeconds,
    constraints: ADMIN_AI_SETTINGS_CONSTRAINTS,
    disabledByEnvironment,
    effectiveRequirementGenerationEnabled:
      settings.requirementGenerationEnabled && !disabledByEnvironment,
    mcpImportMaxRows: settings.mcpImportMaxRows,
    mcpImportValidationTtlMinutes: settings.mcpImportValidationTtlMinutes,
    mcpMaxRequestBytes: settings.mcpMaxRequestBytes,
    requirementGenerationEnabled: settings.requirementGenerationEnabled,
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
    /(?:mcp_max_request_bytes|mcp_import_max_rows|mcp_import_validation_ttl_minutes|ai_safety_rule_cache_ttl_seconds|ai_safety_forensic_logging_enabled)/i.test(
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
    aiSafetyForensicLoggingEnabled: true,
    aiSafetyRuleCacheTtlSeconds: AI_SAFETY_RULE_CACHE_TTL_DEFAULT_SECONDS,
    mcpImportMaxRows: MCP_IMPORT_MAX_ROWS_DEFAULT,
    mcpImportValidationTtlMinutes: MCP_IMPORT_VALIDATION_TTL_DEFAULT_MINUTES,
    mcpMaxRequestBytes: MCP_REQUEST_PAYLOAD_DEFAULT_BYTES,
    requirementGenerationEnabled: toBoolean(row.requirementGenerationEnabled),
  }
}

async function getAiGenerationSettingsWithLegacyForensicDefault(
  db: SqlServerDatabase,
): Promise<AiGenerationSettings> {
  const rows = (await db.query(`
    SELECT TOP (1)
      ai_safety_rule_cache_ttl_seconds AS aiSafetyRuleCacheTtlSeconds,
      mcp_import_max_rows AS mcpImportMaxRows,
      mcp_import_validation_ttl_minutes AS mcpImportValidationTtlMinutes,
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
    aiSafetyForensicLoggingEnabled: true,
    aiSafetyRuleCacheTtlSeconds: readAiSafetyRuleCacheTtlSeconds(
      row.aiSafetyRuleCacheTtlSeconds,
    ),
    mcpImportMaxRows: readMcpImportMaxRows(row.mcpImportMaxRows),
    mcpImportValidationTtlMinutes: readMcpImportValidationTtlMinutes(
      row.mcpImportValidationTtlMinutes,
    ),
    mcpMaxRequestBytes: readMcpMaxRequestBytes(row.mcpMaxRequestBytes),
    requirementGenerationEnabled: toBoolean(row.requirementGenerationEnabled),
  }
}

async function getAiGenerationSettingsWithLegacyMcpDefaults(
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
    aiSafetyForensicLoggingEnabled: true,
    aiSafetyRuleCacheTtlSeconds: AI_SAFETY_RULE_CACHE_TTL_DEFAULT_SECONDS,
    mcpImportMaxRows: MCP_IMPORT_MAX_ROWS_DEFAULT,
    mcpImportValidationTtlMinutes: MCP_IMPORT_VALIDATION_TTL_DEFAULT_MINUTES,
    mcpMaxRequestBytes: readMcpMaxRequestBytes(row.mcpMaxRequestBytes),
    requirementGenerationEnabled: toBoolean(row.requirementGenerationEnabled),
  }
}

export function clearMcpMaxRequestBytesCacheForTests(): void {
  cachedMcpRuntimeSettings = undefined
}

export function clearMcpRuntimeSettingsCacheForTests(): void {
  cachedMcpRuntimeSettings = undefined
}

export function clearAiSafetyRuntimeSettingsCache(): void {
  cachedAiSafetyRuntimeSettings = undefined
}

export function clearAiSafetyRuntimeSettingsCacheForTests(): void {
  clearAiSafetyRuntimeSettingsCache()
}

export async function getCachedMcpRuntimeSettings(
  db: SqlServerDatabase,
): Promise<McpRuntimeSettings> {
  if (
    cachedMcpRuntimeSettings &&
    cachedMcpRuntimeSettings.expiresAt > Date.now()
  ) {
    return cachedMcpRuntimeSettings.value
  }

  const rows = (await db.query(`
    SELECT TOP (1)
      mcp_import_max_rows AS mcpImportMaxRows,
      mcp_import_validation_ttl_minutes AS mcpImportValidationTtlMinutes,
      mcp_max_request_bytes AS mcpMaxRequestBytes
    FROM ai_settings
    WHERE id = 1
  `)) as AiSettingsRow[]

  const row = rows[0]
  if (!row) {
    cacheMcpRuntimeSettings(DEFAULT_MCP_RUNTIME_SETTINGS)
    return DEFAULT_MCP_RUNTIME_SETTINGS
  }

  const settings = {
    mcpImportMaxRows: Number(row.mcpImportMaxRows),
    mcpImportValidationTtlMinutes: Number(row.mcpImportValidationTtlMinutes),
    mcpMaxRequestBytes: Number(row.mcpMaxRequestBytes),
  }
  assertMcpRuntimeSettings(settings)
  cacheMcpRuntimeSettings(settings)
  return settings
}

export async function getCachedAiSafetyRuntimeSettings(
  db: SqlServerDatabase,
): Promise<AiSafetyRuntimeSettings> {
  if (
    cachedAiSafetyRuntimeSettings &&
    cachedAiSafetyRuntimeSettings.expiresAt > Date.now()
  ) {
    return cachedAiSafetyRuntimeSettings.value
  }

  try {
    const rows = (await db.query(`
      SELECT TOP (1)
        ai_safety_forensic_logging_enabled AS aiSafetyForensicLoggingEnabled
      FROM ai_settings
      WHERE id = 1
    `)) as AiSettingsRow[]

    const row = rows[0]
    if (!row) {
      cacheAiSafetyRuntimeSettings(DEFAULT_AI_SAFETY_RUNTIME_SETTINGS)
      return DEFAULT_AI_SAFETY_RUNTIME_SETTINGS
    }

    const settings = {
      aiSafetyForensicLoggingEnabled: toBoolean(
        row.aiSafetyForensicLoggingEnabled ?? true,
      ),
    }
    cacheAiSafetyRuntimeSettings(settings)
    return settings
  } catch (error) {
    if (
      isExpectedMissingAiSettingsColumnError(
        error,
        'ai_safety_forensic_logging_enabled',
      )
    ) {
      cacheAiSafetyRuntimeSettings(DEFAULT_AI_SAFETY_RUNTIME_SETTINGS)
      return DEFAULT_AI_SAFETY_RUNTIME_SETTINGS
    }
    throw error
  }
}

export async function getCachedMcpMaxRequestBytes(
  db: SqlServerDatabase,
): Promise<number> {
  return (await getCachedMcpRuntimeSettings(db)).mcpMaxRequestBytes
}

export async function getAiGenerationSettings(
  db: SqlServerDatabase,
): Promise<AiGenerationSettings> {
  try {
    const rows = (await db.query(`
      SELECT TOP (1)
        ai_safety_forensic_logging_enabled AS aiSafetyForensicLoggingEnabled,
        ai_safety_rule_cache_ttl_seconds AS aiSafetyRuleCacheTtlSeconds,
        mcp_import_max_rows AS mcpImportMaxRows,
        mcp_import_validation_ttl_minutes AS mcpImportValidationTtlMinutes,
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
      aiSafetyForensicLoggingEnabled: toBoolean(
        row.aiSafetyForensicLoggingEnabled ?? true,
      ),
      aiSafetyRuleCacheTtlSeconds: readAiSafetyRuleCacheTtlSeconds(
        row.aiSafetyRuleCacheTtlSeconds,
      ),
      mcpImportMaxRows: readMcpImportMaxRows(row.mcpImportMaxRows),
      mcpImportValidationTtlMinutes: readMcpImportValidationTtlMinutes(
        row.mcpImportValidationTtlMinutes,
      ),
      mcpMaxRequestBytes: readMcpMaxRequestBytes(row.mcpMaxRequestBytes),
      requirementGenerationEnabled: toBoolean(row.requirementGenerationEnabled),
    }
  } catch (error) {
    if (!isExpectedLegacyAiSettingsReadError(error)) {
      warnUnexpectedAiSettingsFallback(error)
    }
    try {
      if (
        isExpectedMissingAiSettingsColumnError(error, 'mcp_max_request_bytes')
      ) {
        return await getLegacyAiGenerationSettings(db)
      }
      if (
        isExpectedMissingAiSettingsColumnError(
          error,
          'ai_safety_forensic_logging_enabled',
        )
      ) {
        return await getAiGenerationSettingsWithLegacyForensicDefault(db)
      }
      return await getAiGenerationSettingsWithLegacyMcpDefaults(db)
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

export async function getAdminAiSettings(
  db: SqlServerDatabase,
  env: NodeJS.ProcessEnv = process.env,
): Promise<AdminAiSettings> {
  return adminAiSettingsFromSettings(await getAiGenerationSettings(db), env)
}

export async function updateAiGenerationSettings(
  db: SqlServerDatabase,
  values: AiGenerationSettings,
  options: AiSettingsWriteOptions = {},
): Promise<AdminAiSettings> {
  assertMcpMaxRequestBytes(values.mcpMaxRequestBytes)
  assertMcpImportMaxRows(values.mcpImportMaxRows)
  assertMcpImportValidationTtlMinutes(values.mcpImportValidationTtlMinutes)
  assertAiSafetyRuleCacheTtlSeconds(values.aiSafetyRuleCacheTtlSeconds)
  const now = new Date().toISOString()

  await db.transaction(async manager => {
    await manager.query(
      `
        UPDATE ai_settings
        SET
          ai_safety_forensic_logging_enabled = @0,
          ai_safety_rule_cache_ttl_seconds = @1,
          mcp_import_max_rows = @2,
          mcp_import_validation_ttl_minutes = @3,
          mcp_max_request_bytes = @4,
          requirement_generation_enabled = @5,
          updated_at = @6
        WHERE id = 1;

        IF @@ROWCOUNT = 0
        BEGIN
          SET IDENTITY_INSERT ai_settings ON;

          INSERT INTO ai_settings (
            id,
            ai_safety_forensic_logging_enabled,
            ai_safety_rule_cache_ttl_seconds,
            mcp_import_max_rows,
            mcp_import_validation_ttl_minutes,
            mcp_max_request_bytes,
            requirement_generation_enabled,
            created_at,
            updated_at
          )
          VALUES (1, @0, @1, @2, @3, @4, @5, @6, @6);

          SET IDENTITY_INSERT ai_settings OFF;
        END
      `,
      [
        values.aiSafetyForensicLoggingEnabled,
        values.aiSafetyRuleCacheTtlSeconds,
        values.mcpImportMaxRows,
        values.mcpImportValidationTtlMinutes,
        values.mcpMaxRequestBytes,
        values.requirementGenerationEnabled,
        now,
      ],
    )
    await options.audit?.(manager)
  })

  cacheMcpRuntimeSettings({
    mcpImportMaxRows: values.mcpImportMaxRows,
    mcpImportValidationTtlMinutes: values.mcpImportValidationTtlMinutes,
    mcpMaxRequestBytes: values.mcpMaxRequestBytes,
  })
  cacheAiSafetyRuntimeSettings({
    aiSafetyForensicLoggingEnabled: values.aiSafetyForensicLoggingEnabled,
  })
  return adminAiSettingsFromSettings(values, options.env)
}

export async function patchAiGenerationSettings(
  db: SqlServerDatabase,
  patch: AiGenerationSettingsPatch,
  options: AiSettingsWriteOptions = {},
): Promise<AdminAiSettings> {
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
