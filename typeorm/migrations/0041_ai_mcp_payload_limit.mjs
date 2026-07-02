const UP_STATEMENTS = [
  `IF OBJECT_ID(N'ai_settings', N'U') IS NOT NULL
    AND COL_LENGTH(N'ai_settings', N'mcp_max_request_bytes') IS NULL
    ALTER TABLE [ai_settings]
    ADD [mcp_max_request_bytes] int NOT NULL
      CONSTRAINT [df_ai_settings_mcp_max_request_bytes] DEFAULT (1048576)
      WITH VALUES;`,
  `IF OBJECT_ID(N'ai_settings', N'U') IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM sys.check_constraints
      WHERE name = N'chk_ai_settings_mcp_max_request_bytes'
    )
    ALTER TABLE [ai_settings]
    ADD CONSTRAINT [chk_ai_settings_mcp_max_request_bytes]
      CHECK (
        [mcp_max_request_bytes] >= 104858
        AND [mcp_max_request_bytes] <= 5242880
        AND [mcp_max_request_bytes] =
          ((1048576 * ((([mcp_max_request_bytes] * 10) + 524288) / 1048576)) + 5) / 10
      );`,
]

const DOWN_STATEMENTS = [
  `IF OBJECT_ID(N'ai_settings', N'U') IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM sys.check_constraints
      WHERE name = N'chk_ai_settings_mcp_max_request_bytes'
    )
    ALTER TABLE [ai_settings]
    DROP CONSTRAINT [chk_ai_settings_mcp_max_request_bytes];`,
  `IF OBJECT_ID(N'ai_settings', N'U') IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM sys.default_constraints
      WHERE name = N'df_ai_settings_mcp_max_request_bytes'
    )
    ALTER TABLE [ai_settings]
    DROP CONSTRAINT [df_ai_settings_mcp_max_request_bytes];`,
  `IF OBJECT_ID(N'ai_settings', N'U') IS NOT NULL
    AND COL_LENGTH(N'ai_settings', N'mcp_max_request_bytes') IS NOT NULL
    ALTER TABLE [ai_settings]
    DROP COLUMN [mcp_max_request_bytes];`,
]

async function runStatements(queryRunner, statements) {
  for (const statement of statements) {
    await queryRunner.query(statement)
  }
}

export class AiMcpPayloadLimit1718800000000 {
  name = 'AiMcpPayloadLimit1718800000000'

  async up(queryRunner) {
    await runStatements(queryRunner, UP_STATEMENTS)
  }

  async down(queryRunner) {
    await runStatements(queryRunner, DOWN_STATEMENTS)
  }
}

export default AiMcpPayloadLimit1718800000000
