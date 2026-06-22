import type { AiRequirementGenerationAvailability } from '@/lib/ai/generation-availability'
import { isAiRequirementGenerationDisabled } from '@/lib/ai/scan-guard'
import type { SqlServerDatabase } from '@/lib/db'
import { toBoolean } from '@/lib/typeorm/value-mappers'

export interface AiGenerationSettings {
  requirementGenerationEnabled: boolean
}

interface AiSettingsRow {
  requirementGenerationEnabled: boolean | number | string
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
    requirementGenerationEnabled: true,
  })

export function formatAiSettingsLoadError(
  error: unknown,
): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      cause: error.cause,
      message: error.message,
      stack: error.stack,
    }
  }

  return { error }
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
    requirementGenerationEnabled: settings.requirementGenerationEnabled,
  }
}

export async function getAiGenerationSettings(
  db: SqlServerDatabase,
): Promise<AiGenerationSettings> {
  try {
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
      requirementGenerationEnabled: toBoolean(row.requirementGenerationEnabled),
    }
  } catch (error) {
    throw new Error('Failed to load AI settings from the database.', {
      cause: error,
    })
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
  const now = new Date().toISOString()

  await db.transaction(async manager => {
    await manager.query(
      `
        UPDATE ai_settings
        SET
          requirement_generation_enabled = @0,
          updated_at = @1
        WHERE id = 1;

        IF @@ROWCOUNT = 0
        BEGIN
          SET IDENTITY_INSERT ai_settings ON;

          INSERT INTO ai_settings (
            id,
            requirement_generation_enabled,
            created_at,
            updated_at
          )
          VALUES (1, @0, @1, @1);

          SET IDENTITY_INSERT ai_settings OFF;
        END
      `,
      [values.requirementGenerationEnabled, now],
    )
    await options.audit?.(manager)
  })

  return resolveAiGenerationAvailability(values, options.env)
}
