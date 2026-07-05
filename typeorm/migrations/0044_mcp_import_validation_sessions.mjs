const UP_STATEMENTS = [
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
    UPDATE [ai_settings]
    SET [mcp_max_request_bytes] =
      CASE
        WHEN [mcp_max_request_bytes] < 1048576 THEN 1048576
        WHEN [mcp_max_request_bytes] > 10485760 THEN 10485760
        ELSE (([mcp_max_request_bytes] + 524288) / 1048576) * 1048576
      END
    WHERE [mcp_max_request_bytes] < 1048576
       OR [mcp_max_request_bytes] > 10485760
       OR [mcp_max_request_bytes] % 1048576 <> 0;`,
  `IF OBJECT_ID(N'ai_settings', N'U') IS NOT NULL
    AND COL_LENGTH(N'ai_settings', N'mcp_max_request_bytes') IS NOT NULL
    ALTER TABLE [ai_settings]
    ADD CONSTRAINT [df_ai_settings_mcp_max_request_bytes]
      DEFAULT (10485760) FOR [mcp_max_request_bytes];`,
  `IF OBJECT_ID(N'ai_settings', N'U') IS NOT NULL
    AND COL_LENGTH(N'ai_settings', N'mcp_import_max_rows') IS NULL
    ALTER TABLE [ai_settings]
    ADD [mcp_import_max_rows] int NOT NULL
      CONSTRAINT [df_ai_settings_mcp_import_max_rows] DEFAULT (500)
      WITH VALUES;`,
  `IF OBJECT_ID(N'ai_settings', N'U') IS NOT NULL
    AND COL_LENGTH(N'ai_settings', N'mcp_import_validation_ttl_minutes') IS NULL
    ALTER TABLE [ai_settings]
    ADD [mcp_import_validation_ttl_minutes] int NOT NULL
      CONSTRAINT [df_ai_settings_mcp_import_validation_ttl_minutes] DEFAULT (60)
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
        [mcp_max_request_bytes] >= 1048576
        AND [mcp_max_request_bytes] <= 10485760
        AND [mcp_max_request_bytes] % 1048576 = 0
      );`,
  `IF OBJECT_ID(N'ai_settings', N'U') IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM sys.check_constraints
      WHERE name = N'chk_ai_settings_mcp_import_max_rows'
    )
    ALTER TABLE [ai_settings]
    ADD CONSTRAINT [chk_ai_settings_mcp_import_max_rows]
      CHECK ([mcp_import_max_rows] >= 1 AND [mcp_import_max_rows] <= 5000);`,
  `IF OBJECT_ID(N'ai_settings', N'U') IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM sys.check_constraints
      WHERE name = N'chk_ai_settings_mcp_import_validation_ttl_minutes'
    )
    ALTER TABLE [ai_settings]
    ADD CONSTRAINT [chk_ai_settings_mcp_import_validation_ttl_minutes]
      CHECK (
        [mcp_import_validation_ttl_minutes] >= 1
        AND [mcp_import_validation_ttl_minutes] <= 1440
      );`,
  `IF OBJECT_ID(N'requirement_import_validation_sessions', N'U') IS NULL
    CREATE TABLE [requirement_import_validation_sessions] (
      [id] int IDENTITY(1,1) NOT NULL,
      [token_hash] nvarchar(64) NOT NULL,
      [payload_hash] nvarchar(64) NOT NULL,
      [destination_kind] nvarchar(40) NOT NULL,
      [destination_id] int NOT NULL,
      [reference_data_fingerprint] nvarchar(64) NOT NULL,
      [destination_snapshot_json] nvarchar(max) NOT NULL,
      [submitted_payload_json] nvarchar(max) NOT NULL,
      [validation_result_json] nvarchar(max) NOT NULL,
      [execution_result_json] nvarchar(max) NULL,
      [expires_at] datetime2(3) NOT NULL,
      [created_at] datetime2(3) NOT NULL,
      [updated_at] datetime2(3) NOT NULL,
      CONSTRAINT [pk_requirement_import_validation_sessions] PRIMARY KEY ([id]),
      CONSTRAINT [chk_requirement_import_validation_sessions_destination_kind]
        CHECK ([destination_kind] IN (N'requirements_library', N'requirements_specification')),
      CONSTRAINT [chk_requirement_import_validation_sessions_destination_id]
        CHECK ([destination_id] > 0),
      CONSTRAINT [chk_requirement_import_validation_sessions_token_hash]
        CHECK (LEN([token_hash]) = 64),
      CONSTRAINT [chk_requirement_import_validation_sessions_payload_hash]
        CHECK (LEN([payload_hash]) = 64),
      CONSTRAINT [chk_requirement_import_validation_sessions_reference_data_fingerprint]
        CHECK (LEN([reference_data_fingerprint]) = 64),
      CONSTRAINT [chk_requirement_import_validation_sessions_expires_at]
        CHECK ([expires_at] > [created_at]),
      CONSTRAINT [chk_requirement_import_validation_sessions_destination_snapshot_json]
        CHECK (ISJSON([destination_snapshot_json]) = 1),
      CONSTRAINT [chk_requirement_import_validation_sessions_submitted_payload_json]
        CHECK (ISJSON([submitted_payload_json]) = 1),
      CONSTRAINT [chk_requirement_import_validation_sessions_validation_result_json]
        CHECK (ISJSON([validation_result_json]) = 1),
      CONSTRAINT [chk_requirement_import_validation_sessions_execution_result_json]
        CHECK ([execution_result_json] IS NULL OR ISJSON([execution_result_json]) = 1)
    );`,
  `IF OBJECT_ID(N'requirement_import_validation_sessions', N'U') IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM sys.indexes
      WHERE name = N'uq_requirement_import_validation_sessions_token_hash'
        AND object_id = OBJECT_ID(N'requirement_import_validation_sessions')
    )
    CREATE UNIQUE INDEX [uq_requirement_import_validation_sessions_token_hash]
      ON [requirement_import_validation_sessions] ([token_hash]);`,
  `IF OBJECT_ID(N'requirement_import_validation_sessions', N'U') IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM sys.indexes
      WHERE name = N'idx_requirement_import_validation_sessions_expires_at'
        AND object_id = OBJECT_ID(N'requirement_import_validation_sessions')
    )
    CREATE INDEX [idx_requirement_import_validation_sessions_expires_at]
      ON [requirement_import_validation_sessions] ([expires_at]);`,
]

const DOWN_STATEMENTS = [
  `IF OBJECT_ID(N'requirement_import_validation_sessions', N'U') IS NOT NULL
    DROP TABLE [requirement_import_validation_sessions];`,
  `IF OBJECT_ID(N'ai_settings', N'U') IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM sys.check_constraints
      WHERE name = N'chk_ai_settings_mcp_import_validation_ttl_minutes'
    )
    ALTER TABLE [ai_settings]
    DROP CONSTRAINT [chk_ai_settings_mcp_import_validation_ttl_minutes];`,
  `IF OBJECT_ID(N'ai_settings', N'U') IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM sys.check_constraints
      WHERE name = N'chk_ai_settings_mcp_import_max_rows'
    )
    ALTER TABLE [ai_settings]
    DROP CONSTRAINT [chk_ai_settings_mcp_import_max_rows];`,
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
      WHERE name = N'df_ai_settings_mcp_import_validation_ttl_minutes'
    )
    ALTER TABLE [ai_settings]
    DROP CONSTRAINT [df_ai_settings_mcp_import_validation_ttl_minutes];`,
  `IF OBJECT_ID(N'ai_settings', N'U') IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM sys.default_constraints
      WHERE name = N'df_ai_settings_mcp_import_max_rows'
    )
    ALTER TABLE [ai_settings]
    DROP CONSTRAINT [df_ai_settings_mcp_import_max_rows];`,
  `IF OBJECT_ID(N'ai_settings', N'U') IS NOT NULL
    AND COL_LENGTH(N'ai_settings', N'mcp_import_validation_ttl_minutes') IS NOT NULL
    ALTER TABLE [ai_settings]
    DROP COLUMN [mcp_import_validation_ttl_minutes];`,
  `IF OBJECT_ID(N'ai_settings', N'U') IS NOT NULL
    AND COL_LENGTH(N'ai_settings', N'mcp_import_max_rows') IS NOT NULL
    ALTER TABLE [ai_settings]
    DROP COLUMN [mcp_import_max_rows];`,
  `IF OBJECT_ID(N'ai_settings', N'U') IS NOT NULL
    AND COL_LENGTH(N'ai_settings', N'mcp_max_request_bytes') IS NOT NULL
    UPDATE [ai_settings]
    SET [mcp_max_request_bytes] = 1048576
    WHERE [mcp_max_request_bytes] < 104858
       OR [mcp_max_request_bytes] > 5242880
       OR [mcp_max_request_bytes] <>
          ((1048576 * ((([mcp_max_request_bytes] * 10) + 524288) / 1048576)) + 5) / 10;`,
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
    ADD CONSTRAINT [df_ai_settings_mcp_max_request_bytes]
      DEFAULT (1048576) FOR [mcp_max_request_bytes];`,
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

async function runStatements(queryRunner, statements) {
  for (const statement of statements) {
    await queryRunner.query(statement)
  }
}

export class McpImportValidationSessions1719000000000 {
  name = 'McpImportValidationSessions1719000000000'

  async up(queryRunner) {
    await runStatements(queryRunner, UP_STATEMENTS)
  }

  async down(queryRunner) {
    await runStatements(queryRunner, DOWN_STATEMENTS)
  }
}

export default McpImportValidationSessions1719000000000
