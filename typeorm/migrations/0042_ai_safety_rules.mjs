const UP_STATEMENTS = [
  `IF OBJECT_ID(N'ai_settings', N'U') IS NOT NULL
    AND COL_LENGTH(N'ai_settings', N'ai_safety_rule_cache_ttl_seconds') IS NULL
    ALTER TABLE [ai_settings]
    ADD [ai_safety_rule_cache_ttl_seconds] int NOT NULL
      CONSTRAINT [df_ai_settings_ai_safety_rule_cache_ttl_seconds] DEFAULT (600)
      WITH VALUES;`,
  `IF OBJECT_ID(N'ai_settings', N'U') IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM sys.check_constraints
      WHERE name = N'chk_ai_settings_ai_safety_rule_cache_ttl_seconds'
    )
    ALTER TABLE [ai_settings]
    ADD CONSTRAINT [chk_ai_settings_ai_safety_rule_cache_ttl_seconds]
      CHECK (
        [ai_safety_rule_cache_ttl_seconds] >= 30
        AND [ai_safety_rule_cache_ttl_seconds] <= 3600
      );`,
  `IF OBJECT_ID(N'ai_safety_rules', N'U') IS NULL
    CREATE TABLE [ai_safety_rules] (
      [id] int IDENTITY(1,1) NOT NULL,
      [rule_id] nvarchar(64) NOT NULL,
      [category] nvarchar(64) NOT NULL,
      [name_sv] nvarchar(255) NOT NULL,
      [name_en] nvarchar(255) NOT NULL,
      [description_sv] nvarchar(max) NULL,
      [description_en] nvarchar(max) NULL,
      [pattern_kind] nvarchar(64) NOT NULL,
      [window_chars] int NULL,
      [sort_order] int NOT NULL,
      [created_at] datetime2(3) NOT NULL,
      [updated_at] datetime2(3) NOT NULL,
      CONSTRAINT [pk_ai_safety_rules] PRIMARY KEY ([id]),
      CONSTRAINT [uq_ai_safety_rules_rule_id] UNIQUE ([rule_id]),
      CONSTRAINT [chk_ai_safety_rules_pattern_kind]
        CHECK ([pattern_kind] IN (N'paired_terms', N'bidirectional_pair', N'direct_markers'))
    );`,
  `IF OBJECT_ID(N'ai_safety_rule_terms', N'U') IS NULL
    CREATE TABLE [ai_safety_rule_terms] (
      [id] int IDENTITY(1,1) NOT NULL,
      [rule_id] int NOT NULL,
      [term_type] nvarchar(64) NOT NULL,
      [term_text] nvarchar(255) NOT NULL,
      [normalized_term] nvarchar(255) NOT NULL,
      [direction] nvarchar(32) NOT NULL,
      [standard_direction] nvarchar(32) NOT NULL,
      [is_standard] bit NOT NULL CONSTRAINT [df_ai_safety_rule_terms_is_standard] DEFAULT (0),
      [is_active] bit NOT NULL CONSTRAINT [df_ai_safety_rule_terms_is_active] DEFAULT (1),
      [sort_order] int NOT NULL CONSTRAINT [df_ai_safety_rule_terms_sort_order] DEFAULT (0),
      [created_at] datetime2(3) NOT NULL,
      [updated_at] datetime2(3) NOT NULL,
      CONSTRAINT [pk_ai_safety_rule_terms] PRIMARY KEY ([id]),
      CONSTRAINT [uq_ai_safety_rule_terms_rule_type_normalized]
        UNIQUE ([rule_id], [term_type], [normalized_term]),
      CONSTRAINT [chk_ai_safety_rule_terms_term_type]
        CHECK ([term_type] IN (N'action', N'target', N'direct_marker', N'coding')),
      CONSTRAINT [chk_ai_safety_rule_terms_direction]
        CHECK ([direction] IN (N'input', N'output', N'input_output')),
      CONSTRAINT [chk_ai_safety_rule_terms_standard_direction]
        CHECK ([standard_direction] IN (N'input', N'output', N'input_output')),
      CONSTRAINT [chk_ai_safety_rule_terms_normalized_not_empty]
        CHECK (LEN([normalized_term]) > 0)
    );`,
  `IF OBJECT_ID(N'ai_safety_rule_terms', N'U') IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM sys.foreign_keys
      WHERE name = N'fk_ai_safety_rule_terms_rule_id'
    )
    ALTER TABLE [ai_safety_rule_terms] ADD CONSTRAINT [fk_ai_safety_rule_terms_rule_id] FOREIGN KEY ([rule_id]) REFERENCES [ai_safety_rules] ([id]) ON DELETE CASCADE ON UPDATE NO ACTION;`,
  `IF OBJECT_ID(N'ai_safety_rule_terms', N'U') IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM sys.indexes
      WHERE name = N'idx_ai_safety_rule_terms_rule_id'
        AND object_id = OBJECT_ID(N'ai_safety_rule_terms')
    )
    CREATE INDEX [idx_ai_safety_rule_terms_rule_id]
      ON [ai_safety_rule_terms] ([rule_id]);`,
]

const DOWN_STATEMENTS = [
  `IF OBJECT_ID(N'ai_safety_rule_terms', N'U') IS NOT NULL
    DROP TABLE [ai_safety_rule_terms];`,
  `IF OBJECT_ID(N'ai_safety_rules', N'U') IS NOT NULL
    DROP TABLE [ai_safety_rules];`,
  `IF OBJECT_ID(N'ai_settings', N'U') IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM sys.check_constraints
      WHERE name = N'chk_ai_settings_ai_safety_rule_cache_ttl_seconds'
    )
    ALTER TABLE [ai_settings]
    DROP CONSTRAINT [chk_ai_settings_ai_safety_rule_cache_ttl_seconds];`,
  `IF OBJECT_ID(N'ai_settings', N'U') IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM sys.default_constraints
      WHERE name = N'df_ai_settings_ai_safety_rule_cache_ttl_seconds'
    )
    ALTER TABLE [ai_settings]
    DROP CONSTRAINT [df_ai_settings_ai_safety_rule_cache_ttl_seconds];`,
  `IF OBJECT_ID(N'ai_settings', N'U') IS NOT NULL
    AND COL_LENGTH(N'ai_settings', N'ai_safety_rule_cache_ttl_seconds') IS NOT NULL
    ALTER TABLE [ai_settings]
    DROP COLUMN [ai_safety_rule_cache_ttl_seconds];`,
]

async function runStatements(queryRunner, statements) {
  for (const statement of statements) {
    await queryRunner.query(statement)
  }
}

export class AiSafetyRules1718900000000 {
  name = 'AiSafetyRules1718900000000'

  async up(queryRunner) {
    await runStatements(queryRunner, UP_STATEMENTS)
  }

  async down(queryRunner) {
    await runStatements(queryRunner, DOWN_STATEMENTS)
  }
}

export default AiSafetyRules1718900000000
