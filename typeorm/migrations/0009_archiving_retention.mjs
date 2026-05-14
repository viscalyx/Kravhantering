const UP_STATEMENTS = [
  `CREATE TABLE [archiving_retention_policies] (
  [id] int IDENTITY(1,1) NOT NULL,
  [policy_key] nvarchar(120) NOT NULL,
  [information_set] nvarchar(450) NOT NULL,
  [action] nvarchar(32) NOT NULL,
  [age_days] int NOT NULL,
  [status_condition] nvarchar(450) NOT NULL,
  [is_enabled] bit NOT NULL CONSTRAINT [df_archiving_retention_policies_is_enabled] DEFAULT (0),
  [decision_reference] nvarchar(450) NULL,
  [last_run_at] datetime2(3) NULL,
  [created_at] datetime2(3) NOT NULL,
  [updated_at] datetime2(3) NOT NULL,
  CONSTRAINT [pk_archiving_retention_policies] PRIMARY KEY ([id]),
  CONSTRAINT [chk_archiving_retention_policies_action] CHECK ([action] IN (N'delete')),
  CONSTRAINT [chk_archiving_retention_policies_age_days] CHECK ([age_days] >= 0)
);`,
  'CREATE UNIQUE INDEX [uq_archiving_retention_policies_policy_key] ON [archiving_retention_policies] ([policy_key]);',
  'CREATE INDEX [idx_archiving_retention_policies_enabled] ON [archiving_retention_policies] ([is_enabled]);',
  `CREATE TABLE [archiving_retention_runs] (
  [id] int IDENTITY(1,1) NOT NULL,
  [policy_id] int NOT NULL,
  [status] nvarchar(32) NOT NULL CONSTRAINT [df_archiving_retention_runs_status] DEFAULT (N'completed'),
  [started_at] datetime2(3) NOT NULL,
  [completed_at] datetime2(3) NOT NULL,
  [executed_by_hsa_id] nvarchar(64) NULL,
  [executed_by_display_name] nvarchar(max) NOT NULL,
  [preview_token] nvarchar(128) NOT NULL,
  [candidate_count] int NOT NULL CONSTRAINT [df_archiving_retention_runs_candidate_count] DEFAULT (0),
  [archived_count] int NOT NULL CONSTRAINT [df_archiving_retention_runs_archived_count] DEFAULT (0),
  [deleted_count] int NOT NULL CONSTRAINT [df_archiving_retention_runs_deleted_count] DEFAULT (0),
  [skipped_count] int NOT NULL CONSTRAINT [df_archiving_retention_runs_skipped_count] DEFAULT (0),
  [exception_count] int NOT NULL CONSTRAINT [df_archiving_retention_runs_exception_count] DEFAULT (0),
  CONSTRAINT [pk_archiving_retention_runs] PRIMARY KEY ([id]),
  CONSTRAINT [chk_archiving_retention_runs_status] CHECK ([status] IN (N'completed'))
);`,
  'CREATE INDEX [idx_archiving_retention_runs_policy_id] ON [archiving_retention_runs] ([policy_id]);',
  'CREATE INDEX [idx_archiving_retention_runs_started_at] ON [archiving_retention_runs] ([started_at]);',
  'ALTER TABLE [archiving_retention_runs] ADD CONSTRAINT [fk_archiving_retention_runs_policy_id] FOREIGN KEY ([policy_id]) REFERENCES [archiving_retention_policies] ([id]) ON DELETE CASCADE ON UPDATE NO ACTION;',
  `CREATE TABLE [archiving_retention_exceptions] (
  [id] int IDENTITY(1,1) NOT NULL,
  [policy_id] int NOT NULL,
  [source_key] nvarchar(120) NOT NULL,
  [subject_table] nvarchar(120) NOT NULL,
  [subject_id] nvarchar(120) NOT NULL,
  [reason] nvarchar(max) NOT NULL,
  [created_by_hsa_id] nvarchar(64) NULL,
  [created_by_display_name] nvarchar(max) NOT NULL,
  [created_at] datetime2(3) NOT NULL,
  [expires_at] datetime2(3) NULL,
  CONSTRAINT [pk_archiving_retention_exceptions] PRIMARY KEY ([id])
);`,
  'CREATE UNIQUE INDEX [uq_archiving_retention_exceptions_subject] ON [archiving_retention_exceptions] ([policy_id], [source_key], [subject_table], [subject_id]);',
  'CREATE INDEX [idx_archiving_retention_exceptions_policy_source] ON [archiving_retention_exceptions] ([policy_id], [source_key]);',
  'ALTER TABLE [archiving_retention_exceptions] ADD CONSTRAINT [fk_archiving_retention_exceptions_policy_id] FOREIGN KEY ([policy_id]) REFERENCES [archiving_retention_policies] ([id]) ON DELETE CASCADE ON UPDATE NO ACTION;',
]

const DOWN_STATEMENTS = [
  "IF OBJECT_ID(N'archiving_retention_exceptions', N'U') IS NOT NULL DROP TABLE [archiving_retention_exceptions];",
  "IF OBJECT_ID(N'archiving_retention_runs', N'U') IS NOT NULL DROP TABLE [archiving_retention_runs];",
  "IF OBJECT_ID(N'archiving_retention_policies', N'U') IS NOT NULL DROP TABLE [archiving_retention_policies];",
]

export class ArchivingRetention1715300000000 {
  name = 'ArchivingRetention1715300000000'

  async up(queryRunner) {
    for (const sql of UP_STATEMENTS) {
      try {
        await queryRunner.query(sql)
      } catch (err) {
        err.message = `${err.message}\n--- failing statement:\n${sql}`
        throw err
      }
    }
  }

  async down(queryRunner) {
    for (const sql of DOWN_STATEMENTS) {
      try {
        await queryRunner.query(sql)
      } catch (err) {
        err.message = `${err.message}\n--- failing statement:\n${sql}`
        throw err
      }
    }
  }
}

export default ArchivingRetention1715300000000
