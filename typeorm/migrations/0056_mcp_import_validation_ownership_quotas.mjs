const SESSION_QUOTA_SETTING_COLUMNS = [
  {
    check:
      '[mcp_import_max_active_sessions_per_principal] >= 1 AND [mcp_import_max_active_sessions_per_principal] <= 100',
    defaultValue: 10,
    name: 'mcp_import_max_active_sessions_per_principal',
    type: 'int',
  },
  {
    check:
      '[mcp_import_max_active_sessions_per_destination] >= 1 AND [mcp_import_max_active_sessions_per_destination] <= 1000',
    defaultValue: 100,
    name: 'mcp_import_max_active_sessions_per_destination',
    type: 'int',
  },
  {
    check:
      '[mcp_import_max_creations_per_window] >= 1 AND [mcp_import_max_creations_per_window] <= 200',
    defaultValue: 20,
    name: 'mcp_import_max_creations_per_window',
    type: 'int',
  },
  {
    check:
      '[mcp_import_max_reserved_bytes] >= 67108864 AND [mcp_import_max_reserved_bytes] <= 8589934592 AND [mcp_import_max_reserved_bytes] % 67108864 = 0',
    defaultValue: 536870912,
    name: 'mcp_import_max_reserved_bytes',
    type: 'bigint',
  },
]

function addSettingCheckStatement(column) {
  return `IF OBJECT_ID(N'chk_ai_settings_${column.name}', N'C') IS NULL
    ALTER TABLE [ai_settings]
      ADD CONSTRAINT [chk_ai_settings_${column.name}]
      CHECK (${column.check});`
}

const UP_STATEMENTS = [
  `IF COL_LENGTH(N'requirement_import_validation_sessions', N'creator_principal_fingerprint') IS NULL
  BEGIN
    DELETE FROM [requirement_import_validation_sessions];
    ALTER TABLE [requirement_import_validation_sessions]
      ADD [creator_principal_fingerprint] nvarchar(64) NOT NULL;
  END;`,
  `IF COL_LENGTH(N'requirement_import_validation_sessions', N'reserved_bytes') IS NULL
    ALTER TABLE [requirement_import_validation_sessions]
      ADD [reserved_bytes] bigint NOT NULL;`,
  `IF OBJECT_ID(N'chk_requirement_import_validation_sessions_creator_principal_fingerprint', N'C') IS NULL
    ALTER TABLE [requirement_import_validation_sessions]
      ADD CONSTRAINT [chk_requirement_import_validation_sessions_creator_principal_fingerprint]
      CHECK (LEN([creator_principal_fingerprint]) = 64);`,
  `IF OBJECT_ID(N'chk_requirement_import_validation_sessions_reserved_bytes', N'C') IS NULL
    ALTER TABLE [requirement_import_validation_sessions]
      ADD CONSTRAINT [chk_requirement_import_validation_sessions_reserved_bytes]
      CHECK ([reserved_bytes] > 0);`,
  `IF NOT EXISTS (
      SELECT 1 FROM sys.indexes
      WHERE name = N'idx_requirement_import_validation_sessions_principal_expires_at'
        AND object_id = OBJECT_ID(N'requirement_import_validation_sessions')
    )
    CREATE INDEX [idx_requirement_import_validation_sessions_principal_expires_at]
      ON [requirement_import_validation_sessions]
      ([creator_principal_fingerprint], [expires_at]);`,
  `IF NOT EXISTS (
      SELECT 1 FROM sys.indexes
      WHERE name = N'idx_requirement_import_validation_sessions_destination_expires_at'
        AND object_id = OBJECT_ID(N'requirement_import_validation_sessions')
    )
    CREATE INDEX [idx_requirement_import_validation_sessions_destination_expires_at]
      ON [requirement_import_validation_sessions]
      ([destination_kind], [destination_id], [expires_at]);`,
  `IF OBJECT_ID(N'requirement_import_validation_rate_buckets', N'U') IS NULL
    CREATE TABLE [requirement_import_validation_rate_buckets] (
      [id] int IDENTITY(1,1) NOT NULL,
      [principal_fingerprint] nvarchar(64) NOT NULL,
      [window_started_at] datetime2(3) NOT NULL,
      [successful_creations] int NOT NULL,
      [expires_at] datetime2(3) NOT NULL,
      [created_at] datetime2(3) NOT NULL,
      [updated_at] datetime2(3) NOT NULL,
      CONSTRAINT [pk_requirement_import_validation_rate_buckets] PRIMARY KEY ([id]),
      CONSTRAINT [chk_requirement_import_validation_rate_buckets_principal_fingerprint]
        CHECK (LEN([principal_fingerprint]) = 64),
      CONSTRAINT [chk_requirement_import_validation_rate_buckets_successful_creations]
        CHECK ([successful_creations] >= 1 AND [successful_creations] <= 200),
      CONSTRAINT [chk_requirement_import_validation_rate_buckets_window]
        CHECK ([expires_at] > [window_started_at])
    );`,
  `IF NOT EXISTS (
      SELECT 1 FROM sys.indexes
      WHERE name = N'uq_requirement_import_validation_rate_buckets_principal_window'
        AND object_id = OBJECT_ID(N'requirement_import_validation_rate_buckets')
    )
    CREATE UNIQUE INDEX [uq_requirement_import_validation_rate_buckets_principal_window]
      ON [requirement_import_validation_rate_buckets]
      ([principal_fingerprint], [window_started_at]);`,
  `IF NOT EXISTS (
      SELECT 1 FROM sys.indexes
      WHERE name = N'idx_requirement_import_validation_rate_buckets_expires_at'
        AND object_id = OBJECT_ID(N'requirement_import_validation_rate_buckets')
    )
    CREATE INDEX [idx_requirement_import_validation_rate_buckets_expires_at]
      ON [requirement_import_validation_rate_buckets] ([expires_at]);`,
  `IF COL_LENGTH(N'ai_settings', N'mcp_import_max_active_sessions_per_principal') IS NULL
    ALTER TABLE [ai_settings]
      ADD [mcp_import_max_active_sessions_per_principal] int NOT NULL
      CONSTRAINT [df_ai_settings_mcp_import_max_active_sessions_per_principal]
      DEFAULT (10) WITH VALUES;`,
  `IF COL_LENGTH(N'ai_settings', N'mcp_import_max_active_sessions_per_destination') IS NULL
    ALTER TABLE [ai_settings]
      ADD [mcp_import_max_active_sessions_per_destination] int NOT NULL
      CONSTRAINT [df_ai_settings_mcp_import_max_active_sessions_per_destination]
      DEFAULT (100) WITH VALUES;`,
  `IF COL_LENGTH(N'ai_settings', N'mcp_import_max_creations_per_window') IS NULL
    ALTER TABLE [ai_settings]
      ADD [mcp_import_max_creations_per_window] int NOT NULL
      CONSTRAINT [df_ai_settings_mcp_import_max_creations_per_window]
      DEFAULT (20) WITH VALUES;`,
  `IF COL_LENGTH(N'ai_settings', N'mcp_import_max_reserved_bytes') IS NULL
    ALTER TABLE [ai_settings]
      ADD [mcp_import_max_reserved_bytes] bigint NOT NULL
      CONSTRAINT [df_ai_settings_mcp_import_max_reserved_bytes]
      DEFAULT (536870912) WITH VALUES;`,
  ...SESSION_QUOTA_SETTING_COLUMNS.map(addSettingCheckStatement),
  `IF DATABASE_PRINCIPAL_ID(N'kravhantering_runtime') IS NULL
    THROW 51022, 'Runtime permission role is missing.', 1;
  GRANT SELECT, INSERT, UPDATE, DELETE
    ON OBJECT::[dbo].[requirement_import_validation_rate_buckets]
    TO [kravhantering_runtime];
  GRANT UPDATE (
    [mcp_import_max_active_sessions_per_destination],
    [mcp_import_max_active_sessions_per_principal],
    [mcp_import_max_creations_per_window],
    [mcp_import_max_reserved_bytes]
  ) ON OBJECT::[dbo].[ai_settings] TO [kravhantering_runtime];`,
]

const DOWN_STATEMENTS = [
  `DELETE FROM [requirement_import_validation_sessions];`,
  `IF DATABASE_PRINCIPAL_ID(N'kravhantering_runtime') IS NOT NULL
  BEGIN
    REVOKE UPDATE (
      [mcp_import_max_active_sessions_per_destination],
      [mcp_import_max_active_sessions_per_principal],
      [mcp_import_max_creations_per_window],
      [mcp_import_max_reserved_bytes]
    ) ON OBJECT::[dbo].[ai_settings] FROM [kravhantering_runtime];
    REVOKE SELECT, INSERT, UPDATE, DELETE
      ON OBJECT::[dbo].[requirement_import_validation_rate_buckets]
      FROM [kravhantering_runtime];
  END;`,
  `IF OBJECT_ID(N'requirement_import_validation_rate_buckets', N'U') IS NOT NULL
    DROP TABLE [requirement_import_validation_rate_buckets];`,
  `IF EXISTS (
      SELECT 1 FROM sys.indexes
      WHERE name = N'idx_requirement_import_validation_sessions_destination_expires_at'
        AND object_id = OBJECT_ID(N'requirement_import_validation_sessions')
    )
    DROP INDEX [idx_requirement_import_validation_sessions_destination_expires_at]
      ON [requirement_import_validation_sessions];`,
  `IF EXISTS (
      SELECT 1 FROM sys.indexes
      WHERE name = N'idx_requirement_import_validation_sessions_principal_expires_at'
        AND object_id = OBJECT_ID(N'requirement_import_validation_sessions')
    )
    DROP INDEX [idx_requirement_import_validation_sessions_principal_expires_at]
      ON [requirement_import_validation_sessions];`,
  `IF OBJECT_ID(N'chk_requirement_import_validation_sessions_reserved_bytes', N'C') IS NOT NULL
    ALTER TABLE [requirement_import_validation_sessions]
      DROP CONSTRAINT [chk_requirement_import_validation_sessions_reserved_bytes];`,
  `IF OBJECT_ID(N'chk_requirement_import_validation_sessions_creator_principal_fingerprint', N'C') IS NOT NULL
    ALTER TABLE [requirement_import_validation_sessions]
      DROP CONSTRAINT [chk_requirement_import_validation_sessions_creator_principal_fingerprint];`,
  `IF COL_LENGTH(N'requirement_import_validation_sessions', N'reserved_bytes') IS NOT NULL
    ALTER TABLE [requirement_import_validation_sessions]
      DROP COLUMN [reserved_bytes];`,
  `IF COL_LENGTH(N'requirement_import_validation_sessions', N'creator_principal_fingerprint') IS NOT NULL
    ALTER TABLE [requirement_import_validation_sessions]
      DROP COLUMN [creator_principal_fingerprint];`,
  ...[...SESSION_QUOTA_SETTING_COLUMNS].reverse().flatMap(column => [
    `IF OBJECT_ID(N'chk_ai_settings_${column.name}', N'C') IS NOT NULL
      ALTER TABLE [ai_settings] DROP CONSTRAINT [chk_ai_settings_${column.name}];`,
    `IF OBJECT_ID(N'df_ai_settings_${column.name}', N'D') IS NOT NULL
      ALTER TABLE [ai_settings] DROP CONSTRAINT [df_ai_settings_${column.name}];`,
    `IF COL_LENGTH(N'ai_settings', N'${column.name}') IS NOT NULL
      ALTER TABLE [ai_settings] DROP COLUMN [${column.name}];`,
  ]),
]

async function runStatements(queryRunner, statements) {
  for (const statement of statements) {
    await queryRunner.query(statement)
  }
}

export class McpImportValidationOwnershipQuotas1720300000000 {
  name = 'McpImportValidationOwnershipQuotas1720300000000'

  async up(queryRunner) {
    await runStatements(queryRunner, UP_STATEMENTS)
  }

  async down(queryRunner) {
    await runStatements(queryRunner, DOWN_STATEMENTS)
  }
}

export default McpImportValidationOwnershipQuotas1720300000000
