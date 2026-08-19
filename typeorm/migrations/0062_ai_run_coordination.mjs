const UP_STATEMENTS = [
  `ALTER TABLE [ai_run_profile_revisions] ADD
    [maximum_output_tokens] int NOT NULL CONSTRAINT [df_ai_run_profile_revisions_maximum_output_tokens] DEFAULT (8192),
    [maximum_output_bytes] int NOT NULL CONSTRAINT [df_ai_run_profile_revisions_maximum_output_bytes] DEFAULT (4194304),
    [maximum_retained_memory_bytes] int NOT NULL CONSTRAINT [df_ai_run_profile_revisions_maximum_retained_memory_bytes] DEFAULT (8388608),
    [maximum_buffered_events] int NOT NULL CONSTRAINT [df_ai_run_profile_revisions_maximum_buffered_events] DEFAULT (32);`,
  `ALTER TABLE [ai_run_profile_revisions] ADD
    CONSTRAINT [chk_ai_run_profile_revisions_maximum_output_tokens] CHECK ([maximum_output_tokens] BETWEEN 1 AND 1000000),
    CONSTRAINT [chk_ai_run_profile_revisions_maximum_output_bytes] CHECK ([maximum_output_bytes] BETWEEN 1 AND 67108864),
    CONSTRAINT [chk_ai_run_profile_revisions_maximum_retained_memory_bytes] CHECK ([maximum_retained_memory_bytes] BETWEEN 1 AND 134217728),
    CONSTRAINT [chk_ai_run_profile_revisions_maximum_buffered_events] CHECK ([maximum_buffered_events] BETWEEN 1 AND 1024);`,
  `ALTER TABLE [ai_connection_model_operational_states] ADD
    [circuit_open_reason] nvarchar(80) NULL;`,
  `ALTER TABLE [ai_connection_model_operational_states] ADD
    CONSTRAINT [chk_ai_connection_model_operational_states_circuit_reason]
    CHECK (([circuit_breaker_status] = N'closed' AND [circuit_open_reason] IS NULL) OR ([circuit_breaker_status] <> N'closed' AND [circuit_open_reason] IS NOT NULL));`,
  `ALTER TABLE [ai_connection_model_revisions] ADD
    [maximum_concurrency] int NULL;`,
  `ALTER TABLE [ai_connection_model_revisions] ADD
    CONSTRAINT [chk_ai_connection_model_revisions_maximum_concurrency]
    CHECK ([maximum_concurrency] IS NULL OR [maximum_concurrency] BETWEEN 1 AND 100);`,
  `CREATE TRIGGER [trg_ai_connection_model_revisions_runtime_limits_immutable]
    ON [ai_connection_model_revisions]
    AFTER UPDATE
    AS
    BEGIN
      SET NOCOUNT ON;
      IF UPDATE([maximum_concurrency]) AND EXISTS (
        SELECT 1 FROM [inserted] AS [i]
        INNER JOIN [deleted] AS [d] ON [d].[id] = [i].[id]
        WHERE [d].[status] <> N'draft' OR [i].[status] <> N'draft'
      ) THROW 51201, 'AI connection model revision runtime limits are immutable; create a new revision.', 1;
    END;`,
  `CREATE TRIGGER [trg_ai_run_profile_revisions_runtime_limits_immutable]
    ON [ai_run_profile_revisions]
    AFTER UPDATE
    AS
    BEGIN
      SET NOCOUNT ON;
      IF (UPDATE([maximum_output_tokens]) OR UPDATE([maximum_output_bytes]) OR UPDATE([maximum_retained_memory_bytes]) OR UPDATE([maximum_buffered_events])) AND EXISTS (
        SELECT 1 FROM [inserted] AS [i]
        INNER JOIN [deleted] AS [d] ON [d].[id] = [i].[id]
        WHERE [d].[status] <> N'draft' OR [i].[status] <> N'draft'
      ) THROW 51202, 'AI run profile revision runtime limits are immutable; create a new revision.', 1;
    END;`,
  `CREATE TABLE [ai_run_coordination_entries] (
    [id] uniqueidentifier NOT NULL CONSTRAINT [df_ai_run_coordination_entries_id] DEFAULT NEWID(),
    [application_run_id] nvarchar(100) NOT NULL,
    [fencing_token] uniqueidentifier NOT NULL,
    [ai_connection_id] uniqueidentifier NOT NULL,
    [ai_connection_model_revision_id] uniqueidentifier NOT NULL,
    [ai_run_profile_revision_id] uniqueidentifier NOT NULL,
    [queue_sequence] bigint IDENTITY(1,1) NOT NULL,
    [status] nvarchar(24) NOT NULL,
    [attempt_count] tinyint NOT NULL CONSTRAINT [df_ai_run_coordination_entries_attempt_count] DEFAULT (0),
    [not_before] datetime2(3) NOT NULL,
    [total_deadline_at] datetime2(3) NOT NULL,
    [lease_owner_id] uniqueidentifier NULL,
    [lease_expires_at] datetime2(3) NULL,
    [created_at] datetime2(3) NOT NULL,
    [updated_at] datetime2(3) NOT NULL,
    CONSTRAINT [pk_ai_run_coordination_entries] PRIMARY KEY ([id]),
    CONSTRAINT [uq_ai_run_coordination_entries_application_run_id] UNIQUE ([application_run_id]),
    CONSTRAINT [chk_ai_run_coordination_entries_status] CHECK ([status] IN (N'queued', N'running', N'retry_wait')),
    CONSTRAINT [chk_ai_run_coordination_entries_attempt_count] CHECK ([attempt_count] BETWEEN 0 AND 2),
    CONSTRAINT [chk_ai_run_coordination_entries_lease] CHECK (([status] = N'running' AND [lease_owner_id] IS NOT NULL AND [lease_expires_at] IS NOT NULL) OR ([status] <> N'running' AND [lease_owner_id] IS NULL AND [lease_expires_at] IS NULL)),
    CONSTRAINT [chk_ai_run_coordination_entries_deadline] CHECK ([total_deadline_at] > [created_at])
  );`,
  `ALTER TABLE [ai_run_coordination_entries] ADD CONSTRAINT [fk_ai_run_coordination_entries_ai_connection_id] FOREIGN KEY ([ai_connection_id]) REFERENCES [ai_connections] ([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;`,
  `ALTER TABLE [ai_run_coordination_entries] ADD CONSTRAINT [fk_ai_run_coordination_entries_ai_connection_model_revision_id] FOREIGN KEY ([ai_connection_model_revision_id]) REFERENCES [ai_connection_model_revisions] ([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;`,
  `ALTER TABLE [ai_run_coordination_entries] ADD CONSTRAINT [fk_ai_run_coordination_entries_ai_run_profile_revision_id] FOREIGN KEY ([ai_run_profile_revision_id]) REFERENCES [ai_run_profile_revisions] ([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;`,
  `CREATE UNIQUE INDEX [uq_ai_run_coordination_entries_queue_sequence] ON [ai_run_coordination_entries] ([queue_sequence]);`,
  `CREATE INDEX [idx_ai_run_coordination_entries_fifo] ON [ai_run_coordination_entries] ([ai_connection_id], [status], [not_before], [queue_sequence]);`,
  `CREATE INDEX [idx_ai_run_coordination_entries_lease_expires_at] ON [ai_run_coordination_entries] ([lease_expires_at]) WHERE [lease_expires_at] IS NOT NULL;`,
  `IF DATABASE_PRINCIPAL_ID(N'kravhantering_runtime') IS NULL THROW 51200, 'Runtime permission role is missing.', 1;
   GRANT SELECT, INSERT, DELETE ON OBJECT::[dbo].[ai_run_coordination_entries] TO [kravhantering_runtime];
   GRANT UPDATE ([status], [attempt_count], [not_before], [lease_owner_id], [lease_expires_at], [updated_at]) ON OBJECT::[dbo].[ai_run_coordination_entries] TO [kravhantering_runtime];`,
]

const DOWN_STATEMENTS = [
  `IF OBJECT_ID(N'ai_run_coordination_entries', N'U') IS NOT NULL DROP TABLE [ai_run_coordination_entries];`,
  `IF OBJECT_ID(N'ai_connection_model_operational_states', N'U') IS NOT NULL BEGIN
     ALTER TABLE [ai_connection_model_operational_states] DROP CONSTRAINT [chk_ai_connection_model_operational_states_circuit_reason];
     ALTER TABLE [ai_connection_model_operational_states] DROP COLUMN [circuit_open_reason];
   END;`,
  `IF OBJECT_ID(N'ai_connection_model_revisions', N'U') IS NOT NULL BEGIN
     DROP TRIGGER IF EXISTS [trg_ai_connection_model_revisions_runtime_limits_immutable];
     ALTER TABLE [ai_connection_model_revisions] DROP CONSTRAINT [chk_ai_connection_model_revisions_maximum_concurrency];
     ALTER TABLE [ai_connection_model_revisions] DROP COLUMN [maximum_concurrency];
   END;`,
  `IF OBJECT_ID(N'ai_run_profile_revisions', N'U') IS NOT NULL BEGIN
     DROP TRIGGER IF EXISTS [trg_ai_run_profile_revisions_runtime_limits_immutable];
     ALTER TABLE [ai_run_profile_revisions] DROP CONSTRAINT [chk_ai_run_profile_revisions_maximum_output_tokens], [chk_ai_run_profile_revisions_maximum_output_bytes], [chk_ai_run_profile_revisions_maximum_retained_memory_bytes], [chk_ai_run_profile_revisions_maximum_buffered_events];
     ALTER TABLE [ai_run_profile_revisions] DROP CONSTRAINT [df_ai_run_profile_revisions_maximum_output_tokens], [df_ai_run_profile_revisions_maximum_output_bytes], [df_ai_run_profile_revisions_maximum_retained_memory_bytes], [df_ai_run_profile_revisions_maximum_buffered_events];
     ALTER TABLE [ai_run_profile_revisions] DROP COLUMN [maximum_output_tokens], [maximum_output_bytes], [maximum_retained_memory_bytes], [maximum_buffered_events];
   END;`,
]

export class AiRunCoordination1720800000001 {
  name = 'AiRunCoordination1720800000001'

  async up(queryRunner) {
    for (const statement of UP_STATEMENTS) await queryRunner.query(statement)
  }

  async down(queryRunner) {
    for (const statement of DOWN_STATEMENTS) await queryRunner.query(statement)
  }
}

export default AiRunCoordination1720800000001
