const UP_STATEMENTS = [
  `IF OBJECT_ID(N'ai_forensic_capture_windows', N'U') IS NULL
    CREATE TABLE [ai_forensic_capture_windows] (
      [id] int IDENTITY(1,1) NOT NULL,
      [operation] nvarchar(80) NOT NULL,
      [direction] nvarchar(6) NOT NULL,
      [requested_by_hsa_id] nvarchar(64) NULL,
      [requested_by_display_name] nvarchar(255) NOT NULL,
      [requested_at] datetime2(3) NOT NULL,
      [approved_by_hsa_id] nvarchar(64) NULL,
      [approved_by_display_name] nvarchar(255) NULL,
      [approved_at] datetime2(3) NULL,
      [expires_at] datetime2(3) NOT NULL,
      [expiry_audited_at] datetime2(3) NULL,
      [stopped_by_hsa_id] nvarchar(64) NULL,
      [stopped_by_display_name] nvarchar(255) NULL,
      [stopped_at] datetime2(3) NULL,
      [purged_by_hsa_id] nvarchar(64) NULL,
      [purged_by_display_name] nvarchar(255) NULL,
      [purged_at] datetime2(3) NULL,
      [is_open] bit NULL,
      [event_byte_limit] int NOT NULL,
      [event_item_limit] int NOT NULL,
      [collection_item_limit] int NOT NULL,
      CONSTRAINT [pk_ai_forensic_capture_windows] PRIMARY KEY ([id]),
      CONSTRAINT [chk_ai_forensic_capture_windows_operation]
        CHECK ([operation] IN (N'ai.generate-requirement-import', N'ai.repair-requirement-import-json')),
      CONSTRAINT [chk_ai_forensic_capture_windows_direction]
        CHECK ([direction] IN (N'input', N'output')),
      CONSTRAINT [chk_ai_forensic_capture_windows_expires_at]
        CHECK ([expires_at] BETWEEN DATEADD(minute, 5, [requested_at])
          AND DATEADD(minute, 60, [requested_at])),
      CONSTRAINT [chk_ai_forensic_capture_windows_event_byte_limit]
        CHECK ([event_byte_limit] BETWEEN 256 AND 8192),
      CONSTRAINT [chk_ai_forensic_capture_windows_event_item_limit]
        CHECK ([event_item_limit] BETWEEN 1 AND 8),
      CONSTRAINT [chk_ai_forensic_capture_windows_collection_item_limit]
        CHECK ([collection_item_limit] BETWEEN 1 AND 1000)
    );`,
  `CREATE UNIQUE INDEX [uq_ai_forensic_capture_windows_is_open]
    ON [ai_forensic_capture_windows] ([is_open]) WHERE [is_open] = 1;`,
  `CREATE INDEX [idx_ai_forensic_capture_windows_expires_at]
    ON [ai_forensic_capture_windows] ([expires_at]);`,
  `CREATE INDEX [idx_ai_forensic_capture_windows_requested_by_hsa_id]
    ON [ai_forensic_capture_windows] ([requested_by_hsa_id]);`,
  `CREATE INDEX [idx_ai_forensic_capture_windows_approved_by_hsa_id]
    ON [ai_forensic_capture_windows] ([approved_by_hsa_id]);`,
  `IF OBJECT_ID(N'ai_forensic_evidence_events', N'U') IS NULL
    CREATE TABLE [ai_forensic_evidence_events] (
      [id] bigint IDENTITY(1,1) NOT NULL,
      [ai_forensic_capture_window_id] int NOT NULL,
      [event_id] uniqueidentifier NOT NULL,
      [actor_fingerprint] nvarchar(64) NULL,
      [blocked_step] nvarchar(40) NOT NULL,
      [primary_rule_id] nvarchar(80) NULL,
      [rule_ids_json] nvarchar(1024) NOT NULL,
      [evidence_json] nvarchar(max) NOT NULL,
      [item_count] int NOT NULL,
      [byte_count] int NOT NULL,
      [captured_at] datetime2(3) NOT NULL,
      CONSTRAINT [pk_ai_forensic_evidence_events] PRIMARY KEY ([id]),
      CONSTRAINT [chk_ai_forensic_evidence_events_rule_ids_json]
        CHECK (ISJSON([rule_ids_json]) = 1),
      CONSTRAINT [chk_ai_forensic_evidence_events_evidence_json]
        CHECK (ISJSON([evidence_json]) = 1),
      CONSTRAINT [chk_ai_forensic_evidence_events_item_count]
        CHECK ([item_count] BETWEEN 1 AND 8),
      CONSTRAINT [chk_ai_forensic_evidence_events_byte_count]
        CHECK ([byte_count] BETWEEN 2 AND 8192 AND DATALENGTH([evidence_json]) = [byte_count])
    );`,
  `IF OBJECT_ID(N'ai_forensic_evidence_events', N'U') IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM sys.foreign_keys
      WHERE name = N'fk_ai_forensic_evidence_events_ai_forensic_capture_window_id'
    )
    ALTER TABLE [ai_forensic_evidence_events] ADD CONSTRAINT [fk_ai_forensic_evidence_events_ai_forensic_capture_window_id] FOREIGN KEY ([ai_forensic_capture_window_id]) REFERENCES [ai_forensic_capture_windows] ([id]) ON DELETE CASCADE ON UPDATE NO ACTION;`,
  `CREATE UNIQUE INDEX [uq_ai_forensic_evidence_events_event_id]
    ON [ai_forensic_evidence_events] ([event_id]);`,
  `CREATE INDEX [idx_ai_forensic_evidence_events_ai_forensic_capture_window_id]
    ON [ai_forensic_evidence_events] ([ai_forensic_capture_window_id]);`,
  `CREATE INDEX [idx_ai_forensic_evidence_events_actor_fingerprint]
    ON [ai_forensic_evidence_events] ([actor_fingerprint]);`,
  `CREATE INDEX [idx_ai_forensic_evidence_events_captured_at]
    ON [ai_forensic_evidence_events] ([captured_at]);`,
  `IF OBJECT_ID(N'ai_settings', N'U') IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM sys.default_constraints
      WHERE name = N'df_ai_settings_ai_safety_forensic_logging_enabled'
    )
    ALTER TABLE [ai_settings]
    DROP CONSTRAINT [df_ai_settings_ai_safety_forensic_logging_enabled];`,
  `IF OBJECT_ID(N'ai_settings', N'U') IS NOT NULL
    AND COL_LENGTH(N'ai_settings', N'ai_safety_forensic_logging_enabled') IS NOT NULL
    ALTER TABLE [ai_settings]
    DROP COLUMN [ai_safety_forensic_logging_enabled];`,
]

const DOWN_STATEMENTS = [
  `IF OBJECT_ID(N'ai_settings', N'U') IS NOT NULL
    AND COL_LENGTH(N'ai_settings', N'ai_safety_forensic_logging_enabled') IS NULL
    ALTER TABLE [ai_settings]
    ADD [ai_safety_forensic_logging_enabled] bit NOT NULL
      CONSTRAINT [df_ai_settings_ai_safety_forensic_logging_enabled] DEFAULT (0)
      WITH VALUES;`,
  `IF OBJECT_ID(N'ai_forensic_evidence_events', N'U') IS NOT NULL
    DROP TABLE [ai_forensic_evidence_events];`,
  `IF OBJECT_ID(N'ai_forensic_capture_windows', N'U') IS NOT NULL
    DROP TABLE [ai_forensic_capture_windows];`,
]

export class AiForensicEvidenceStore1720500000000 {
  name = 'AiForensicEvidenceStore1720500000000'

  async up(queryRunner) {
    for (const statement of UP_STATEMENTS) await queryRunner.query(statement)
  }

  async down(queryRunner) {
    for (const statement of DOWN_STATEMENTS) await queryRunner.query(statement)
  }
}

export default AiForensicEvidenceStore1720500000000
