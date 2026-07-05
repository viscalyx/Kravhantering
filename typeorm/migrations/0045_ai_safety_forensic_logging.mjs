const UP_STATEMENTS = [
  `IF OBJECT_ID(N'ai_settings', N'U') IS NOT NULL
    AND COL_LENGTH(N'ai_settings', N'ai_safety_forensic_logging_enabled') IS NULL
    ALTER TABLE [ai_settings]
    ADD [ai_safety_forensic_logging_enabled] bit NOT NULL
      CONSTRAINT [df_ai_settings_ai_safety_forensic_logging_enabled] DEFAULT (1)
      WITH VALUES;`,
]

const DOWN_STATEMENTS = [
  `IF OBJECT_ID(N'ai_settings', N'U') IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM sys.default_constraints
      WHERE name = N'df_ai_settings_ai_safety_forensic_logging_enabled'
    )
    ALTER TABLE [ai_settings]
    DROP CONSTRAINT [df_ai_settings_ai_safety_forensic_logging_enabled];`,
  `IF OBJECT_ID(N'ai_settings', N'U') IS NOT NULL
    AND COL_LENGTH(N'ai_settings', N'ai_safety_forensic_logging_enabled') IS NOT NULL
    ALTER TABLE [ai_settings]
    DROP COLUMN [ai_safety_forensic_logging_enabled];`,
]

async function runStatements(queryRunner, statements) {
  for (const statement of statements) {
    await queryRunner.query(statement)
  }
}

export class AiSafetyForensicLogging1719200000000 {
  name = 'AiSafetyForensicLogging1719200000000'

  async up(queryRunner) {
    await runStatements(queryRunner, UP_STATEMENTS)
  }

  async down(queryRunner) {
    await runStatements(queryRunner, DOWN_STATEMENTS)
  }
}

export default AiSafetyForensicLogging1719200000000
