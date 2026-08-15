const DROP_DEFAULT = `IF OBJECT_ID(N'ai_settings', N'U') IS NOT NULL
    AND COL_LENGTH(N'ai_settings', N'ai_safety_forensic_logging_enabled') IS NOT NULL
    AND OBJECT_ID(
      N'df_ai_settings_ai_safety_forensic_logging_enabled',
      N'D'
    ) IS NOT NULL
    ALTER TABLE [ai_settings]
    DROP CONSTRAINT [df_ai_settings_ai_safety_forensic_logging_enabled];`

const APPLY_FRESH_INSTALL_DEFAULT = `IF OBJECT_ID(N'ai_settings', N'U') IS NOT NULL
    AND COL_LENGTH(N'ai_settings', N'ai_safety_forensic_logging_enabled') IS NOT NULL
    UPDATE [ai_settings]
    SET [ai_safety_forensic_logging_enabled] = 0
    WHERE [id] = 1;`

function addDefault(value) {
  return `IF OBJECT_ID(N'ai_settings', N'U') IS NOT NULL
    AND COL_LENGTH(N'ai_settings', N'ai_safety_forensic_logging_enabled') IS NOT NULL
    AND OBJECT_ID(
      N'df_ai_settings_ai_safety_forensic_logging_enabled',
      N'D'
    ) IS NULL
    ALTER TABLE [ai_settings]
    ADD CONSTRAINT [df_ai_settings_ai_safety_forensic_logging_enabled] DEFAULT (${value})
      FOR [ai_safety_forensic_logging_enabled];`
}

const UP_STATEMENTS = [DROP_DEFAULT, addDefault(0)]

const DOWN_STATEMENTS = [DROP_DEFAULT, addDefault(1)]

async function runStatements(queryRunner, statements) {
  for (const statement of statements) {
    await queryRunner.query(statement)
  }
}

export class AiSafetyForensicDefault1720400000000 {
  name = 'AiSafetyForensicDefault1720400000000'

  async up(queryRunner) {
    const freshInstallation =
      queryRunner.connection?.options?.kravhanteringFreshInstallation === true
    await runStatements(queryRunner, [
      ...UP_STATEMENTS,
      ...(freshInstallation ? [APPLY_FRESH_INSTALL_DEFAULT] : []),
    ])
  }

  async down(queryRunner) {
    await runStatements(queryRunner, DOWN_STATEMENTS)
  }
}

export default AiSafetyForensicDefault1720400000000
